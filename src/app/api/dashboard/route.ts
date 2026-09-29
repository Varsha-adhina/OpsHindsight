import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMemoryStatus } from "@/lib/hindsight";

export async function GET() {
  try {
    const [
      activeCount,
      resolvedCount,
      resolvedAll,
      incidents,
      resolutions,
      memoryStatus,
      runbooks,
      allOps,
      analysesWithMemory,
    ] = await Promise.all([
      prisma.incident.count({
        where: { status: { in: ["active", "investigating", "mitigating"] } },
      }),
      prisma.incident.count({
        where: {
          status: "resolved",
          resolvedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.incident.count({ where: { status: "resolved" } }),
      prisma.incident.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
        include: { resolution: true },
      }),
      prisma.incidentResolution.findMany(),
      getMemoryStatus(),
      prisma.runbook.findMany({ orderBy: { successCount: "desc" } }),
      // Load all ops for accurate aggregation (app-scale is small)
      prisma.memoryOperation.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          incident: { select: { externalId: true, service: true } },
        },
      }),
      prisma.incidentAnalysis.count({ where: { memoryCount: { gt: 0 } } }),
    ]);

    const norm = (s: string) => (s || "").toLowerCase().trim();

    const successfulRecalls = allOps.filter(
      (o) => norm(o.operationType) === "recall" && norm(o.status) === "success"
    );
    const successfulReflects = allOps.filter(
      (o) => norm(o.operationType) === "reflect" && norm(o.status) === "success"
    );
    // Post-mortem / resolution retains only (not intake/observation)
    const lessonRetains = allOps.filter((o) => {
      if (norm(o.operationType) !== "retain" || norm(o.status) !== "success") {
        return false;
      }
      const s = (o.summary || "").toLowerCase();
      const q = (o.query || "").toLowerCase();
      return (
        s.includes("post-mortem") ||
        s.includes("postmortem") ||
        s.includes("resolution learning") ||
        q.startsWith("post-mortem:") ||
        q.startsWith("postmortem:")
      );
    });

    const incidentsRemembered = new Set(
      successfulRecalls.map((o) => o.incidentId).filter(Boolean) as string[]
    ).size;

    const avgResolution =
      resolutions.length > 0
        ? Math.round(
            resolutions.reduce((s, r) => s + (r.durationMinutes || 0), 0) /
              resolutions.length
          )
        : 0;

    const serviceCounts: Record<string, number> = {};
    for (const i of incidents) {
      serviceCounts[i.service] = (serviceCounts[i.service] || 0) + 1;
    }
    const topService =
      Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "n/a";

    const severityDist = ["SEV-1", "SEV-2", "SEV-3", "SEV-4"].map((s) => ({
      name: s,
      value: incidents.filter((i) => i.severity === s).length,
    }));

    const byService = Object.entries(serviceCounts).map(([name, value]) => ({
      name,
      value,
    }));

    const runbookSuccess = runbooks.slice(0, 8).map((r) => ({
      name: r.name,
      rate:
        r.successCount + r.failureCount > 0
          ? Math.round(
              (r.successCount / (r.successCount + r.failureCount)) * 100
            )
          : 0,
      success: r.successCount,
      failure: r.failureCount,
    }));

    const days: { date: string; count: number }[] = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      const key = day.toISOString().slice(0, 10);
      const count = incidents.filter(
        (i) => i.startedAt.toISOString().slice(0, 10) === key
      ).length;
      days.push({ date: key.slice(5), count });
    }

    const recentHindsightOps = allOps.slice(0, 5).map((o) => ({
      id: o.id,
      operationType: o.operationType,
      status: o.status,
      resultCount: o.resultCount,
      summary: o.summary,
      createdAt: o.createdAt,
      incidentId: o.incidentId,
      externalId: o.incident?.externalId || null,
      service: o.incident?.service || null,
    }));

    return NextResponse.json({
      activeIncidents: activeCount,
      resolvedThisWeek: resolvedCount,
      incidentsResolved: resolvedAll,
      avgResolutionMinutes: avgResolution,
      hindsightMemories: memoryStatus.totalMemories,
      historicalInMemory: memoryStatus.totalMemories,
      learningEvents: allOps.length,
      topService,
      recommendedAction:
        topService === "payments-api"
          ? "Review payments-api retry-handler connection lifecycle in CI"
          : `Add preventive checks for ${topService}`,
      severityDist,
      byService,
      runbookSuccess,
      incidentsOverTime: days,
      recentIncidents: incidents.slice(0, 12).map((i) => ({
        id: i.id,
        externalId: i.externalId,
        title: i.title,
        service: i.service,
        severity: i.severity,
        status: i.status,
        startedAt: i.startedAt,
        rootCause: i.resolution?.rootCause || null,
        durationMinutes: i.resolution?.durationMinutes ?? null,
        runbook: i.resolution?.runbook || null,
      })),
      memoryStatus,
      recentMemoryOps: recentHindsightOps,
      recentHindsightOps,
      memoryImpact: {
        incidentsRemembered,
        memoriesRecalled: successfulRecalls.length,
        recommendationsInfluenced: analysesWithMemory,
        lessonsRetained: lessonRetains.length,
        reflections: successfulReflects.length,
        totalOperationsLogged: allOps.length,
        source: "persistent application Hindsight operation logs (MemoryOperation)",
      },
      definitions: {
        hindsightMemories: "from Hindsight bank",
        incidentsRemembered:
          "DISTINCT incidentId among successful RECALL rows in MemoryOperation",
        successfulRecalls:
          "COUNT MemoryOperation where operationType=recall AND status=success",
        recommendationsInfluenced:
          "COUNT IncidentAnalysis where memoryCount > 0",
        lessonsRetained:
          "COUNT successful RETAIN rows tagged as post-mortem learning",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "dashboard error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMemoryStatus } from "@/lib/hindsight";

export async function GET() {
  const [
    incidents,
    resolvedIncidents,
    resolutions,
    runbooks,
    opsGrouped,
    memoryStatus,
    recentResolutions,
    recallOps,
    retainOps,
    reflectOps,
    recentOps,
    analysesInfluenced,
  ] = await Promise.all([
    prisma.incident.count(),
    prisma.incident.count({ where: { status: "resolved" } }),
    prisma.incidentResolution.findMany(),
    prisma.runbook.findMany({ orderBy: { successCount: "desc" } }),
    prisma.memoryOperation.groupBy({
      by: ["operationType"],
      _count: true,
    }),
    getMemoryStatus(),
    prisma.incidentResolution.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { incident: true },
    }),
    prisma.memoryOperation.findMany({
      where: { operationType: "recall", status: "success" },
      select: { incidentId: true },
    }),
    prisma.memoryOperation.count({
      where: {
        operationType: "retain",
        status: "success",
        OR: [
          { summary: { contains: "Post-mortem" } },
          { summary: { contains: "learning" } },
          { summary: { contains: "resolution" } },
        ],
      },
    }),
    prisma.memoryOperation.count({
      where: { operationType: "reflect", status: "success" },
    }),
    prisma.memoryOperation.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { incident: { select: { externalId: true, service: true } } },
    }),
    prisma.incidentAnalysis.count({ where: { memoryCount: { gt: 0 } } }),
  ]);

  const avgDuration =
    resolutions.length > 0
      ? Math.round(
          resolutions.reduce((s, r) => s + (r.durationMinutes || 0), 0) /
            resolutions.length
        )
      : 0;

  const byService = await prisma.incident.groupBy({
    by: ["service"],
    _count: true,
  });

  const incidentsRemembered = new Set(
    recallOps.map((o) => o.incidentId).filter(Boolean)
  ).size;

  const retainedCount = resolvedIncidents;
  const learningCurve = [
    {
      stage: "Initial",
      description: "Generic recommendation from current evidence only",
      confidence: 0.3,
      active: analysesInfluenced === 0,
    },
    {
      stage: "After first recalls",
      description: "Service-aware recommendation from retained history",
      confidence: 0.5,
      active: analysesInfluenced > 0 && analysesInfluenced < 5,
    },
    {
      stage: "After more incidents",
      description: "Historical pattern + runbook-aware recommendation",
      confidence: 0.7,
      active: analysesInfluenced >= 5 && analysesInfluenced < 15,
    },
    {
      stage: "Mature memory",
      description: "Team-specific failure modes and preferred runbooks",
      confidence: 0.85,
      active: analysesInfluenced >= 15,
    },
  ];

  return NextResponse.json({
    totalIncidents: incidents,
    incidentsRetained: resolvedIncidents,
    avgResolutionMinutes: avgDuration,
    learningEvents: opsGrouped.reduce((s, o) => s + o._count, 0),
    hindsightMemories: memoryStatus.totalMemories,
    hindsightMode: memoryStatus.mode,
    hindsightConnected: memoryStatus.connected,
    hindsightMessage: memoryStatus.message,
    bankId: memoryStatus.bankId,
    // Real Hindsight activity (application logs)
    hindsightActivity: {
      successfulRecalls: recallOps.length,
      successfulRetains: retainOps,
      reflections: reflectOps,
      incidentsInfluenced: analysesInfluenced,
      incidentsRemembered,
      source: "application Hindsight operation logs",
    },
    successfulRecalls: recallOps.length,
    successfulRetains: retainOps,
    operationCounts: opsGrouped.map((o) => ({
      operation: o.operationType,
      count: o._count,
    })),
    learningTimeline: recentOps.map((o) => ({
      id: o.id,
      at: o.createdAt,
      operation: o.operationType,
      status: o.status,
      summary: o.summary,
      resultCount: o.resultCount,
      externalId: o.incident?.externalId || null,
      service: o.incident?.service || null,
    })),
    runbooks: runbooks.map((r) => ({
      name: r.name,
      service: r.service,
      successRate:
        r.successCount + r.failureCount > 0
          ? r.successCount / (r.successCount + r.failureCount)
          : 0,
      successCount: r.successCount,
      failureCount: r.failureCount,
      avgMinutes: r.averageResolutionMinutes,
      source: "application incident history",
    })),
    memoryCoverage: byService.map((s) => ({
      service: s.service,
      incidents: s._count,
    })),
    learningCurve,
    recentKnowledge: recentResolutions.map((r) => ({
      externalId: r.incident.externalId,
      service: r.incident.service,
      severity: r.incident.severity,
      rootCause: r.rootCause,
      runbook: r.runbook,
      durationMinutes: r.durationMinutes,
      lessons: r.feedback || r.preventiveActions,
      createdAt: r.createdAt,
    })),
    definitions: {
      hindsightMemories: "Count from Hindsight bank (live)",
      successfulRecalls: "Successful RECALL ops in application logs",
      lessonsRetained: "Successful post-mortem RETAIN ops in application logs",
      recommendationsInfluenced: "Analyses with memoryCount > 0",
    },
  });
}

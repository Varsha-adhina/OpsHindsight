import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeIncident } from "@/lib/incident-agent";
import type { NormalizedIncident } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: { events: { orderBy: { timestamp: "asc" } } },
    });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    let ctx: Record<string, unknown> = {};
    try {
      ctx = incident.normalizedContext ? JSON.parse(incident.normalizedContext) : {};
    } catch { /* */ }

    const normalized: NormalizedIncident = {
      title: incident.title,
      service: incident.service,
      environment: incident.environment,
      severity: incident.severity as NormalizedIncident["severity"],
      alertType: incident.alertType || undefined,
      errorSignature: incident.errorSignature || undefined,
      rawAlert: incident.rawAlert || undefined,
      recentDeployment: (ctx.recentDeployment as string) || undefined,
      customerImpact: incident.customerImpact || undefined,
      symptoms: [],
    };

    const timeline = incident.events.map(
      (e) => `[${e.timestamp.toISOString()}] ${e.eventType}: ${e.content}`
    );
    const observations = incident.events
      .filter((e) => e.eventType === "observation")
      .map((e) => e.content);

    const [withMem, withoutMem] = await Promise.all([
      analyzeIncident(normalized, {
        timeline,
        observations,
        withoutMemory: false,
        incidentId: id,
      }),
      analyzeIncident(normalized, {
        timeline,
        observations,
        withoutMemory: true,
        incidentId: id,
      }),
    ]);

    // Persist the with-memory analysis as primary
    await prisma.incidentAnalysis.create({
      data: {
        incidentId: id,
        summary: withMem.response.incidentSummary,
        responseJson: JSON.stringify({
          withMemory: withMem.response,
          withoutMemory: withoutMem.response,
        }),
        confidence: withMem.response.overallConfidence,
        memoryCount: withMem.memoryTrace.memoryCount,
      },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: "compare",
        content: `Compared with-memory (${withMem.memoryTrace.memoryCount} memories, confidence ${Math.round(withMem.response.overallConfidence * 100)}%) vs without-memory (confidence ${Math.round(withoutMem.response.overallConfidence * 100)}%)`,
        author: "system",
      },
    });

    await prisma.incident.update({
      where: { id },
      data: { status: "investigating" },
    });

    // Build "why memory changed" explanation from actual data
    const withHyp = withMem.response.hypotheses[0]?.cause || "n/a";
    const withoutHyp = withoutMem.response.hypotheses[0]?.cause || "n/a";
    const whyChanged =
      withMem.memoryTrace.memoryCount === 0
        ? "Hindsight returned no relevant historical memories, so recommendations remain based on current evidence only."
        : withHyp !== withoutHyp
          ? `Without memory the top hypothesis was "${withoutHyp}". With Hindsight memory it became "${withHyp}" based on ${withMem.memoryTrace.memoryCount} recalled memories.`
          : `Top hypothesis remained similar, but confidence rose from ${Math.round(withoutMem.response.overallConfidence * 100)}% to ${Math.round(withMem.response.overallConfidence * 100)}% using ${withMem.memoryTrace.memoryCount} historical memories.`;

    return NextResponse.json({
      withMemory: {
        response: withMem.response,
        memoryTrace: withMem.memoryTrace,
      },
      withoutMemory: {
        response: withoutMem.response,
        memoryTrace: withoutMem.memoryTrace,
      },
      whyMemoryChanged: whyChanged,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Compare failed" },
      { status: 500 }
    );
  }
}

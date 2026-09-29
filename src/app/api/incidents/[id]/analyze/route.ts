import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeIncident } from "@/lib/incident-agent";
import type { NormalizedIncident } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const withoutMemory = Boolean(body.withoutMemory);

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        events: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    let ctx: Record<string, unknown> = {};
    try {
      ctx = incident.normalizedContext ? JSON.parse(incident.normalizedContext) : {};
    } catch {
      /* ignore */
    }

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

    // analyzeIncident logs MemoryOperation rows immediately after each Hindsight call
    const { response, memoryTrace } = await analyzeIncident(normalized, {
      timeline,
      observations,
      withoutMemory,
      incidentId: id,
    });

    const analysis = await prisma.incidentAnalysis.create({
      data: {
        incidentId: id,
        summary: response.incidentSummary,
        responseJson: JSON.stringify(response),
        confidence: response.overallConfidence,
        memoryCount: memoryTrace.memoryCount,
      },
    });

    // Verify rows were actually written (surface failure to client)
    const opsForIncident = await prisma.memoryOperation.count({
      where: { incidentId: id },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: "analysis",
        content: withoutMemory
          ? "Analysis generated without Hindsight memory"
          : `Hindsight recall found ${memoryTrace.memoryCount} memories; analysis generated (confidence ${Math.round(response.overallConfidence * 100)}%); MemoryOperation rows for incident=${opsForIncident}`,
        author: "system",
      },
    });

    await prisma.incident.update({
      where: { id },
      data: { status: "investigating", updatedAt: new Date() },
    });

    if (opsForIncident === 0 && !withoutMemory) {
      console.error(
        "[analyze] WARNING: Hindsight ran but zero MemoryOperation rows for incident",
        id
      );
    }

    return NextResponse.json({
      analysisId: analysis.id,
      response,
      memoryTrace,
      memoryOperationsPersisted: opsForIncident,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

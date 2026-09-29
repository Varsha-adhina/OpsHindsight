import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { retainMemory } from "@/lib/hindsight";
import { logMemoryOperation } from "@/lib/memory-ops";

const Schema = z.object({
  eventType: z.string().default("observation"),
  content: z.string().min(1),
  author: z.string().optional(),
  result: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data = Schema.parse(body);

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const event = await prisma.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: data.eventType,
        content: data.content,
        author: data.author || "engineer",
        result: data.result,
      },
    });

    // Retain meaningful observations
    if (data.eventType === "observation" && data.content.length > 20) {
      const retainResult = await retainMemory({
        content: `Observation on ${incident.externalId} (${incident.service}): ${data.content}`,
        documentId: `observation-${incident.externalId}-${Date.now()}`,
        context: "incident_observation",
        metadata: {
          service: incident.service,
          category: "observation",
          externalId: incident.externalId,
        },
        tags: [`service:${incident.service}`, "type:observation"],
      });
      await logMemoryOperation({
        incidentId: id,
        operationType: "retain",
        status: retainResult.success ? "success" : "error",
        durationMs: retainResult.durationMs,
        summary: retainResult.success ? "Observation retained in Hindsight" : retainResult.error || "retain failed",
        query: `observation:${id}`,
        resultCount: retainResult.success ? 1 : 0,
      });
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

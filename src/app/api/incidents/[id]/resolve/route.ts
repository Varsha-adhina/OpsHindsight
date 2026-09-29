import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { retainMemory } from "@/lib/hindsight";
import { buildResolutionMemory } from "@/lib/incident-agent";
import { logMemoryOperation } from "@/lib/memory-ops";

const Schema = z.object({
  rootCause: z.string().min(1),
  contributingFactors: z.string().optional(),
  successfulSteps: z.string().min(1),
  failedSteps: z.string().optional(),
  runbook: z.string().optional(),
  preventiveActions: z.string().optional(),
  customerImpact: z.string().optional(),
  feedback: z.string().optional(),
  feedbackRating: z.enum(["helpful", "partially_helpful", "not_helpful"]).optional(),
  durationMinutes: z.number().optional(),
  acknowledgeMismatch: z.boolean().optional(),
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

    // Soft consistency check: warn if runbook/root cause clearly names another service
    const KNOWN_SERVICES = [
      "payments-api",
      "auth-service",
      "checkout-service",
      "redis-cache",
      "orders-api",
      "inventory-service",
      "notification-service",
      "postgres-primary",
    ];
    const svc = incident.service.toLowerCase();
    const blob = `${data.rootCause} ${data.successfulSteps} ${data.runbook || ""}`.toLowerCase();
    const mismatches: string[] = [];
    for (const other of KNOWN_SERVICES) {
      if (other === svc) continue;
      if (
        (data.runbook || "").toLowerCase().includes(other) ||
        data.rootCause.toLowerCase().includes(other) ||
        data.successfulSteps.toLowerCase().includes(other)
      ) {
        mismatches.push(other);
      }
    }
    if (mismatches.length > 0 && !data.acknowledgeMismatch) {
      return NextResponse.json(
        {
          error: `Fields appear to reference ${mismatches.join(", ")} but this incident is ${incident.service}. Acknowledge the mismatch to save.`,
          warning: true,
          incidentService: incident.service,
          mismatches,
        },
        { status: 400 }
      );
    }

    // If runbook exists in Prisma under a different service, require acknowledge
    if (data.runbook) {
      const existingRb = await prisma.runbook.findUnique({ where: { name: data.runbook } });
      if (
        existingRb &&
        existingRb.service.toLowerCase() !== svc &&
        !data.acknowledgeMismatch
      ) {
        return NextResponse.json(
          {
            error: `Runbook "${data.runbook}" is registered for service ${existingRb.service}, but this incident is ${incident.service}. Acknowledge to continue.`,
            warning: true,
            incidentService: incident.service,
            runbookService: existingRb.service,
          },
          { status: 400 }
        );
      }
    }

    const duration =
      data.durationMinutes ??
      Math.round((Date.now() - incident.startedAt.getTime()) / 60000);

    const resolution = await prisma.incidentResolution.upsert({
      where: { incidentId: id },
      create: {
        incidentId: id,
        rootCause: data.rootCause,
        contributingFactors: data.contributingFactors,
        successfulSteps: data.successfulSteps,
        failedSteps: data.failedSteps,
        runbook: data.runbook,
        preventiveActions: data.preventiveActions,
        customerImpact: data.customerImpact,
        feedback: data.feedback,
        feedbackRating: data.feedbackRating,
        durationMinutes: duration,
      },
      update: {
        rootCause: data.rootCause,
        successfulSteps: data.successfulSteps,
        failedSteps: data.failedSteps,
        runbook: data.runbook,
        preventiveActions: data.preventiveActions,
        feedback: data.feedback,
        feedbackRating: data.feedbackRating,
        durationMinutes: duration,
      },
    });

    await prisma.incident.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date() },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: "resolved",
        content: `Root cause: ${data.rootCause}`,
        author: "engineer",
        result: "success",
      },
    });

    if (data.runbook) {
      const rb = await prisma.runbook.findUnique({ where: { name: data.runbook } });
      if (rb) {
        await prisma.runbook.update({
          where: { name: data.runbook },
          data: {
            successCount: rb.successCount + 1,
            averageResolutionMinutes: rb.averageResolutionMinutes
              ? (rb.averageResolutionMinutes * rb.successCount + duration) /
                (rb.successCount + 1)
              : duration,
          },
        });
      } else if (data.runbook) {
        await prisma.runbook.create({
          data: {
            name: data.runbook,
            service: incident.service,
            successCount: 1,
            averageResolutionMinutes: duration,
          },
        });
      }
    }

    const feedbackNote = data.feedbackRating
      ? `Engineer feedback rating: ${data.feedbackRating.replace(/_/g, " ")}. ${data.feedback || ""}`
      : data.feedback;
    const memoryContent = await buildResolutionMemory({
      externalId: incident.externalId,
      service: incident.service,
      severity: incident.severity,
      rootCause: data.rootCause,
      successfulSteps: data.successfulSteps,
      failedSteps: data.failedSteps,
      runbook: data.runbook,
      durationMinutes: duration,
      lessons: feedbackNote || data.feedback,
      preventiveActions: data.preventiveActions,
    });

    const retainResult = await retainMemory({
      content: memoryContent,
      documentId: `incident-${incident.externalId}`,
      context: "resolved_incident",
      timestamp: new Date().toISOString(),
      metadata: {
        service: incident.service,
        category: "resolved_incident",
        externalId: incident.externalId,
        severity: incident.severity,
      },
      tags: [`service:${incident.service}`, "type:resolution", "source:postmortem"],
    });

    await logMemoryOperation({
      incidentId: id,
      operationType: "retain",
      status: retainResult.success ? "success" : "error",
      durationMs: retainResult.durationMs,
      query: `post-mortem:${incident.externalId}`,
      resultCount: retainResult.success ? 1 : 0,
      summary: retainResult.success
        ? "Post-mortem learning retained in Hindsight"
        : retainResult.error || "retain failed",
    });

    return NextResponse.json({
      resolution,
      learned: {
        retained: retainResult.success,
        memoryId: retainResult.memoryId,
        documentId: retainResult.documentId,
        contentPreview: memoryContent.slice(0, 400),
        mode: retainResult.mode,
        error: retainResult.error,
      },
    }, { status: retainResult.success ? 200 : 207 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Resolve failed" }, { status: 500 });
  }
}

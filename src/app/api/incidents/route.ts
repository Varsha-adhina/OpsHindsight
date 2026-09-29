import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const CreateSchema = z.object({
  title: z.string().min(1),
  service: z.string().min(1),
  environment: z.string().default("production"),
  severity: z.enum(["SEV-1", "SEV-2", "SEV-3", "SEV-4"]),
  alertType: z.string().optional(),
  errorSignature: z.string().optional(),
  rawAlert: z.string().optional(),
  customerImpact: z.string().optional(),
  recentDeployment: z.string().optional(),
  normalizedContext: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const service = searchParams.get("service");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (service) where.service = service;

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { startedAt: "desc" },
    include: { resolution: true, analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return NextResponse.json({ incidents });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreateSchema.parse(body);
    const externalId = `INC-${Date.now().toString().slice(-6)}`;

    const incident = await prisma.incident.create({
      data: {
        externalId,
        title: data.title,
        service: data.service,
        environment: data.environment,
        severity: data.severity,
        status: "active",
        alertType: data.alertType,
        errorSignature: data.errorSignature,
        rawAlert: data.rawAlert,
        customerImpact: data.customerImpact,
        normalizedContext: data.normalizedContext
          ? data.normalizedContext
          : JSON.stringify({ recentDeployment: data.recentDeployment }),
      },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "created",
        content: `Incident created: ${data.title}`,
        author: "system",
      },
    });

    return NextResponse.json({ incident }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}

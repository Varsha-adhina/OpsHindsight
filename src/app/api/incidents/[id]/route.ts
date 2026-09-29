import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      events: { orderBy: { timestamp: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 3 },
      resolution: true,
      memoryOps: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ incident });
}

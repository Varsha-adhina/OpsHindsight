import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Debug/inspection: list persisted Hindsight operation logs from the app DB */
export async function GET() {
  const ops = await prisma.memoryOperation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      incident: { select: { externalId: true, service: true } },
    },
  });

  const counts = {
    total: ops.length, // note: only last 50 loaded for list; recount all:
  };

  const [total, recallSuccess, retainSuccess, reflectSuccess] =
    await Promise.all([
      prisma.memoryOperation.count(),
      prisma.memoryOperation.count({
        where: { operationType: "recall", status: "success" },
      }),
      prisma.memoryOperation.count({
        where: { operationType: "retain", status: "success" },
      }),
      prisma.memoryOperation.count({
        where: { operationType: "reflect", status: "success" },
      }),
    ]);

  return NextResponse.json({
    counts: {
      total,
      recallSuccess,
      retainSuccess,
      reflectSuccess,
    },
    recent: ops.map((o) => ({
      id: o.id,
      operationType: o.operationType,
      status: o.status,
      resultCount: o.resultCount,
      summary: o.summary,
      query: o.query,
      incidentId: o.incidentId,
      externalId: o.incident?.externalId || null,
      service: o.incident?.service || null,
      createdAt: o.createdAt,
    })),
    source: "Prisma MemoryOperation table",
  });
}

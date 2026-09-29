import { NextResponse } from "next/server";
import { getMemoryStatus } from "@/lib/hindsight";
import { prisma } from "@/lib/db";

export async function GET() {
  const status = await getMemoryStatus();
  const recentOps = await prisma.memoryOperation.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const recentMemories = await prisma.demoMemory.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({
    ...status,
    recentOps,
    recentMemories: recentMemories.map((m) => ({
      id: m.memoryId,
      content: m.content,
      service: m.service,
      category: m.category,
      createdAt: m.createdAt,
    })),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMemoryStatus } from "@/lib/hindsight";
import { hasGroqKey } from "@/lib/utils";

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const hindsight = await getMemoryStatus();

  let memoryOpsCount = -1;
  let memoryOpsError: string | null = null;
  try {
    memoryOpsCount = await prisma.memoryOperation.count();
  } catch (e) {
    memoryOpsError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    status: dbOk && memoryOpsError === null ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? "connected" : "error",
      memoryOperationTable:
        memoryOpsError === null
          ? { status: "ok", rowCount: memoryOpsCount }
          : { status: "error", error: memoryOpsError },
      groq: hasGroqKey() ? "configured" : "demo",
      hindsight: {
        status: hindsight.connected ? "connected" : "fallback",
        mode: hindsight.mode,
        bankId: hindsight.bankId,
        totalMemories: hindsight.totalMemories,
        message: hindsight.message,
      },
    },
  });
}

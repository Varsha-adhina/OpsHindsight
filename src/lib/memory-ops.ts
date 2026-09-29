import { prisma } from "@/lib/db";

export type MemoryOpType = "recall" | "reflect" | "retain";
export type MemoryOpStatus = "success" | "error" | "skipped";

export type LogMemoryOpResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Persist a Hindsight operation to the application SQLite DB (MemoryOperation).
 * Called immediately after each real Hindsight RECALL / REFLECT / RETAIN completes.
 */
export async function logMemoryOperation(input: {
  incidentId?: string | null;
  operationType: MemoryOpType | string;
  status: MemoryOpStatus | string;
  query?: string | null;
  resultCount?: number | null;
  durationMs?: number | null;
  summary?: string | null;
}): Promise<LogMemoryOpResult> {
  const operationType = String(input.operationType).toLowerCase();
  const status = String(input.status).toLowerCase();

  try {
    const row = await prisma.memoryOperation.create({
      data: {
        incidentId: input.incidentId || null,
        operationType,
        status,
        query: input.query ?? null,
        resultCount:
          input.resultCount === undefined || input.resultCount === null
            ? null
            : Number(input.resultCount),
        durationMs:
          input.durationMs === undefined || input.durationMs === null
            ? null
            : Number(input.durationMs),
        summary: input.summary ?? null,
      },
    });

    console.log(
      `[MemoryOperation] ${operationType.toUpperCase()} persisted`,
      `id=${row.id}`,
      `incidentId=${input.incidentId || "null"}`,
      `status=${status}`,
      `memoryCount=${input.resultCount ?? "n/a"}`
    );

    return { ok: true, id: row.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[MemoryOperation] FAILED to persist ${operationType.toUpperCase()}:`,
      message
    );
    return { ok: false, error: message };
  }
}

export async function logMemoryOperations(
  ops: Array<{
    incidentId?: string | null;
    operationType: string;
    status: string;
    query?: string | null;
    resultCount?: number | null;
    durationMs?: number | null;
    summary?: string | null;
  }>
): Promise<{ logged: number; errors: string[] }> {
  let logged = 0;
  const errors: string[] = [];
  for (const op of ops) {
    const r = await logMemoryOperation(op);
    if (r.ok) logged += 1;
    else errors.push(r.error);
  }
  return { logged, errors };
}

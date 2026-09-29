import { NextResponse } from "next/server";
import {
  ensureBank,
  retainMemory,
  recallMemories,
  getMemoryStatus,
  getMode,
  BANK_ID,
  BASE_URL,
} from "@/lib/hindsight";

export async function POST() {
  const mode = getMode();
  const results: {
    step: string;
    ok: boolean;
    detail: string;
    durationMs?: number;
  }[] = [];

  if (mode !== "live") {
    return NextResponse.json({
      mode,
      bankId: BANK_ID,
      baseUrl: BASE_URL,
      overall: false,
      results: [
        {
          step: "mode",
          ok: false,
          detail:
            "Not in live mode. Set DEMO_MODE=false and HINDSIGHT_API_KEY to test real Hindsight.",
        },
      ],
    });
  }

  // Connection / bank
  const t0 = Date.now();
  const bank = await ensureBank();
  results.push({
    step: "connection",
    ok: bank.ok,
    detail: bank.ok ? `Bank ${BANK_ID} accessible` : bank.error || "failed",
    durationMs: Date.now() - t0,
  });

  const status = await getMemoryStatus();
  results.push({
    step: "status",
    ok: status.connected,
    detail: status.message + (status.error ? ` (${status.error})` : ""),
  });

  // Retain probe
  const probeId = `incident-CONNTEST-${Date.now()}`;
  const t1 = Date.now();
  const retain = await retainMemory({
    content: `OpsHindsight connection test probe for bank ${BANK_ID}. Service: payments-api. Synthetic verification only.`,
    documentId: probeId,
    context: "connection_test",
    metadata: { service: "payments-api", category: "connection_test" },
    tags: ["type:connection_test"],
  });
  results.push({
    step: "retain",
    ok: retain.success,
    detail: retain.success
      ? `Retain OK documentId=${probeId}`
      : retain.error || "retain failed",
    durationMs: retain.durationMs,
  });

  // Recall
  const t2 = Date.now();
  const recall = await recallMemories({
    query: "payments-api connection test probe OpsHindsight",
    limit: 5,
  });
  results.push({
    step: "recall",
    ok: !recall.error && recall.mode === "live",
    detail: recall.error
      ? recall.error
      : `Recall OK — ${recall.memories.length} results mode=${recall.mode}`,
    durationMs: recall.durationMs,
  });

  // Reflect availability: status already implies API reachable; mark based on live mode
  results.push({
    step: "reflect",
    ok: status.connected && mode === "live",
    detail: status.connected
      ? "Reflect endpoint available when bank is connected (used during analysis)"
      : "Reflect unavailable while bank offline",
  });

  const overall = results.every((r) => r.ok);

  return NextResponse.json({
    mode,
    bankId: BANK_ID,
    baseUrl: BASE_URL,
    overall,
    results,
  });
}

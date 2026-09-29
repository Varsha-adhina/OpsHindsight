/**
 * Live Hindsight integration verification.
 *
 * Usage:
 *   DEMO_MODE=false HINDSIGHT_API_KEY=... HINDSIGHT_BASE_URL=... npx tsx scripts/test-hindsight.ts
 *
 * Prints PASS/FAIL for connection, retain, recall, and round-trip.
 */
import {
  ensureBank,
  retainMemory,
  recallMemories,
  getMemoryStatus,
  getMode,
  BANK_ID,
  BASE_URL,
} from "../src/lib/hindsight";

function pass(label: string, detail = "") {
  console.log(`PASS  ${label}${detail ? " — " + detail : ""}`);
}
function fail(label: string, detail = "") {
  console.log(`FAIL  ${label}${detail ? " — " + detail : ""}`);
}

async function main() {
  console.log("=== OpsHindsight ↔ Hindsight verification ===");
  console.log(`mode=${getMode()} bank=${BANK_ID} base=${BASE_URL}`);
  console.log("");

  if (getMode() !== "live") {
    fail(
      "HINDSIGHT CONNECTION",
      "Not in live mode. Set DEMO_MODE=false and HINDSIGHT_API_KEY"
    );
    process.exit(1);
  }

  // 1. Connection / bank
  const bank = await ensureBank();
  if (!bank.ok) {
    fail("HINDSIGHT CONNECTION", bank.error);
    process.exit(1);
  }
  pass("HINDSIGHT CONNECTION", `bank ${BANK_ID} ensured`);

  const status = await getMemoryStatus();
  if (!status.connected || status.mode !== "live") {
    fail("HINDSIGHT STATUS", status.message + " " + (status.error || ""));
    process.exit(1);
  }
  pass("HINDSIGHT STATUS", status.message);

  // 2. Retain a unique probe document
  const probeId = `incident-VERIFY-${Date.now()}`;
  const probeContent = [
    `Incident ID: VERIFY-PROBE`,
    `Service: payments-api`,
    `Severity: SEV-1`,
    `Alert: HTTP 5xx rate exceeded during verification probe`,
    `Root cause: Synthetic test for OpsHindsight Hindsight integration.`,
    `Successful resolution: No production change; probe only.`,
    `Lesson: retain and recall must round-trip through bank ${BANK_ID}.`,
  ].join("\n");

  const retain = await retainMemory({
    content: probeContent,
    documentId: probeId,
    context: "verification",
    timestamp: new Date().toISOString(),
    metadata: { service: "payments-api", category: "verification", source: "test-hindsight" },
    tags: ["service:payments-api", "type:verification"],
  });

  if (!retain.success) {
    fail("RETAIN", retain.error);
    process.exit(1);
  }
  pass("RETAIN", `documentId=${probeId} duration=${retain.durationMs}ms`);

  // Brief wait for indexing
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Recall
  const recall = await recallMemories({
    query:
      "payments-api HTTP 5xx verification probe OpsHindsight synthetic test retain recall",
    limit: 10,
  });

  if (recall.error && recall.memories.length === 0) {
    fail("RECALL", recall.error);
    process.exit(1);
  }
  pass("RECALL", `${recall.memories.length} memories in ${recall.durationMs}ms mode=${recall.mode}`);

  // 4. Memory retrieved containing probe signal
  const joined = recall.memories.map((m) => m.content).join("\n").toLowerCase();
  const hit =
    joined.includes("verify") ||
    joined.includes("synthetic") ||
    joined.includes("opshindsight") ||
    joined.includes("payments-api");

  if (!hit) {
    fail(
      "MEMORY RETRIEVED",
      "Recall returned results but none matched the probe content. First result: " +
        (recall.memories[0]?.content?.slice(0, 120) || "(empty)")
    );
    process.exit(1);
  }
  pass("MEMORY RETRIEVED", `matched probe in ${recall.memories.length} result(s)`);

  console.log("");
  console.log("=== ALL CHECKS PASSED — real Hindsight is in use ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

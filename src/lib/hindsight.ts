/**
 * Hindsight client — official API paths (v1/default/banks/...).
 *
 * Live endpoints (from Hindsight docs):
 *   POST /v1/default/banks/{bank_id}/memories          — retain
 *   POST /v1/default/banks/{bank_id}/memories/recall    — recall
 *   POST /v1/default/banks/{bank_id}/reflect            — reflect
 *   GET  /v1/default/banks/{bank_id}/memories/list      — list / count
 *   GET  /v1/default/banks/{bank_id}/stats              — bank stats (if available)
 *   PUT  /v1/default/banks/{bank_id}                    — create/ensure bank
 *
 * Demo mode keeps a local DemoMemory adapter for UI-only development.
 * Live mode NEVER pretends DemoMemory rows are Hindsight memories.
 */

import { prisma } from "./db";
import { isDemoMode, hasHindsightKey } from "./utils";
import type {
  HindsightMemory,
  RetainInput,
  RecallInput,
  ReflectInput,
} from "@/types";

const BASE_URL = (
  process.env.HINDSIGHT_BASE_URL || "https://api.hindsight.vectorize.io"
).replace(/\/$/, "");
const API_KEY = process.env.HINDSIGHT_API_KEY || "";
const BANK_ID = process.env.HINDSIGHT_BANK_ID || "opshindsight-incidents";

export type HindsightMode = "live" | "demo" | "fallback";

/** Live only when DEMO_MODE is not true AND an API key is present. */
function getMode(): HindsightMode {
  if (process.env.DEMO_MODE === "true") return "demo";
  if (!hasHindsightKey()) return "demo";
  return "live";
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
  if (API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  return h;
}

async function liveFetch(
  path: string,
  options: RequestInit = {},
  timeoutMs = 60000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...authHeaders(),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Ensure bank exists (idempotent). Safe to call repeatedly. */
export async function ensureBank(): Promise<{ ok: boolean; error?: string }> {
  if (getMode() !== "live") return { ok: true };
  try {
    const res = await liveFetch(`/v1/default/banks/${encodeURIComponent(BANK_ID)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "OpsHindsight Incidents",
        mission:
          "Remember production incidents, root causes, successful and failed remediation steps, runbooks, and lessons learned so engineers can resolve similar incidents faster.",
      }),
    });
    if (res.ok || res.status === 409) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `ensureBank ${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ensureBank failed" };
  }
}

export async function getMemoryStatus(): Promise<{
  connected: boolean;
  mode: HindsightMode;
  bankId: string;
  totalMemories: number;
  message: string;
  error?: string;
}> {
  const mode = getMode();

  if (mode === "demo") {
    const count = await prisma.demoMemory.count();
    return {
      connected: false,
      mode: "demo",
      bankId: BANK_ID,
      totalMemories: count,
      message:
        "DEMO MODE — local DemoMemory only. Set DEMO_MODE=false and HINDSIGHT_API_KEY to use real Hindsight.",
    };
  }

  try {
    await ensureBank();

    const listRes = await liveFetch(
      `/v1/default/banks/${encodeURIComponent(BANK_ID)}/memories/list?limit=1`,
      { method: "GET" },
      15000
    );

    if (listRes.ok) {
      const data = await listRes.json();
      let finalTotal =
        typeof data.total === "number"
          ? data.total
          : typeof data.count === "number"
            ? data.count
            : Array.isArray(data.items)
              ? data.items.length
              : Array.isArray(data.memories)
                ? data.memories.length
                : 0;

      if (!data.total && !data.count) {
        try {
          const statsRes = await liveFetch(
            `/v1/default/banks/${encodeURIComponent(BANK_ID)}/stats`,
            { method: "GET" },
            8000
          );
          if (statsRes.ok) {
            const stats = await statsRes.json();
            finalTotal =
              stats.memory_count ??
              stats.memoryCount ??
              stats.total_memories ??
              stats.total ??
              finalTotal;
          }
        } catch {
          /* stats optional */
        }
      }

      return {
        connected: true,
        mode: "live",
        bankId: BANK_ID,
        totalMemories: finalTotal,
        message: `LIVE HINDSIGHT — connected to bank ${BANK_ID}`,
      };
    }

    const errText = await listRes.text();
    return {
      connected: false,
      mode: "fallback",
      bankId: BANK_ID,
      totalMemories: 0,
      message: "Hindsight unavailable",
      error: `status ${listRes.status}: ${errText.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      connected: false,
      mode: "fallback",
      bankId: BANK_ID,
      totalMemories: 0,
      message: "Hindsight unavailable",
      error: e instanceof Error ? e.message : "connection failed",
    };
  }
}

export type RetainOptions = RetainInput & {
  documentId?: string;
  context?: string;
  timestamp?: string;
  tags?: string[];
};

export async function retainMemory(
  input: RetainOptions
): Promise<{
  success: boolean;
  memoryId?: string;
  documentId?: string;
  durationMs: number;
  mode: HindsightMode;
  error?: string;
}> {
  const start = Date.now();
  const mode = getMode();
  const documentId =
    input.documentId ||
    (input.metadata?.documentId as string) ||
    (input.metadata?.externalId
      ? `incident-${input.metadata.externalId}`
      : undefined);

  try {
    if (mode === "live") {
      await ensureBank();

      const item: Record<string, unknown> = {
        content: input.content,
      };
      if (input.context || input.metadata?.category) {
        item.context = input.context || String(input.metadata?.category);
      }
      if (input.timestamp) item.timestamp = input.timestamp;
      if (documentId) item.document_id = documentId;
      if (input.metadata) {
        const meta: Record<string, string> = {};
        for (const [k, v] of Object.entries(input.metadata)) {
          if (v == null) continue;
          meta[k] = typeof v === "string" ? v : JSON.stringify(v);
        }
        if (Object.keys(meta).length) item.metadata = meta;
      }
      if (input.tags?.length) item.tags = input.tags;

      const res = await liveFetch(
        `/v1/default/banks/${encodeURIComponent(BANK_ID)}/memories`,
        {
          method: "POST",
          body: JSON.stringify({ items: [item] }),
        },
        120000
      );

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          durationMs: Date.now() - start,
          mode,
          error: `Retain failed ${res.status}: ${text.slice(0, 300)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        memoryId: data.operation_id || documentId || `retain_${Date.now()}`,
        documentId,
        durationMs: Date.now() - start,
        mode,
      };
    }

    // Demo only — local store, clearly not Hindsight
    const memoryId =
      documentId || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.demoMemory.upsert({
      where: { memoryId },
      create: {
        memoryId,
        content: input.content,
        service: (input.metadata?.service as string) || null,
        category: (input.metadata?.category as string) || "incident",
        metadata: JSON.stringify(input.metadata || {}),
      },
      update: { content: input.content },
    });
    return {
      success: true,
      memoryId,
      documentId,
      durationMs: Date.now() - start,
      mode,
    };
  } catch (e) {
    return {
      success: false,
      durationMs: Date.now() - start,
      mode: mode === "live" ? "fallback" : mode,
      error: e instanceof Error ? e.message : "retain failed",
    };
  }
}

export async function recallMemories(
  input: RecallInput
): Promise<{
  memories: HindsightMemory[];
  durationMs: number;
  mode: HindsightMode;
  error?: string;
}> {
  const start = Date.now();
  const mode = getMode();
  const limit = input.limit ?? 8;

  try {
    if (mode === "live") {
      const body: Record<string, unknown> = {
        query: input.query,
        budget: "mid",
        max_tokens: 4096,
      };

      const res = await liveFetch(
        `/v1/default/banks/${encodeURIComponent(BANK_ID)}/memories/recall`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        30000
      );

      if (!res.ok) {
        const text = await res.text();
        return {
          memories: [],
          durationMs: Date.now() - start,
          mode: "fallback",
          error: `Recall failed ${res.status}: ${text.slice(0, 300)}`,
        };
      }

      const data = await res.json();
      const raw = data.results || data.memories || data.items || [];
      const memories: HindsightMemory[] = (Array.isArray(raw) ? raw : [])
        .slice(0, limit)
        .map((m: Record<string, unknown>, i: number) => ({
          id: String(m.id || m.document_id || `live_${i}`),
          content: String(m.text || m.content || m.fact || ""),
          score:
            typeof m.score === "number"
              ? m.score
              : typeof m.relevance === "number"
                ? m.relevance
                : 0.5,
          metadata: {
            type: m.type,
            context: m.context,
            document_id: m.document_id,
            entities: m.entities,
            tags: m.tags,
            ...(typeof m.metadata === "object" && m.metadata
              ? (m.metadata as object)
              : {}),
          },
          createdAt: (m.mentioned_at ||
            m.occurred_start ||
            m.created_at) as string | undefined,
        }))
        .filter((m) => m.content.length > 0);

      return { memories, durationMs: Date.now() - start, mode };
    }

    // Demo mode only — local keyword search
    const all = await prisma.demoMemory.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const queryLower = input.query.toLowerCase();
    const tokens = queryLower.split(/\s+/).filter((t) => t.length > 2);

    const scored = all
      .map((m) => {
        const contentLower = m.content.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (contentLower.includes(t)) score += 1;
        }
        if (input.filters?.service && m.service === input.filters.service)
          score += 3;
        return { memory: m, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const memories: HindsightMemory[] = scored.map((s) => ({
      id: s.memory.memoryId,
      content: s.memory.content,
      score: Math.min(1, s.score / (tokens.length + 3)),
      metadata: s.memory.metadata ? JSON.parse(s.memory.metadata) : {},
      createdAt: s.memory.createdAt.toISOString(),
    }));

    return { memories, durationMs: Date.now() - start, mode };
  } catch (e) {
    return {
      memories: [],
      durationMs: Date.now() - start,
      mode: mode === "live" ? "fallback" : mode,
      error: e instanceof Error ? e.message : "recall failed",
    };
  }
}

export async function reflectOnIncident(
  input: ReflectInput
): Promise<{
  reflection: string;
  durationMs: number;
  mode: HindsightMode;
  error?: string;
}> {
  const start = Date.now();
  const mode = getMode();

  const parts: string[] = [];
  parts.push("=== CURRENT INCIDENT ===");
  parts.push(JSON.stringify(input.incident, null, 2));
  if (input.timeline?.length) {
    parts.push("\n=== TIMELINE ===");
    parts.push(input.timeline.join("\n"));
  }
  if (input.observations?.length) {
    parts.push("\n=== OBSERVATIONS ===");
    parts.push(input.observations.join("\n"));
  }
  parts.push("\n=== RECALLED HINDSIGHT MEMORIES ===");
  if (input.memories.length === 0) {
    parts.push("No relevant historical memories found.");
  } else {
    input.memories.forEach((m, i) => {
      parts.push(
        `\n[Memory ${i + 1} id=${m.id} score=${m.score?.toFixed(2) ?? "n/a"}]`
      );
      parts.push(m.content);
    });
  }

  if (mode === "live") {
    try {
      const query = [
        `Analyze this production incident and compare it with historical operational knowledge.`,
        `Service: ${input.incident.service}`,
        `Severity: ${input.incident.severity}`,
        `Alert: ${input.incident.alertType || input.incident.errorSignature || "unknown"}`,
        `What similar past incidents, root causes, and successful fixes are known?`,
      ].join(" ");

      const res = await liveFetch(
        `/v1/default/banks/${encodeURIComponent(BANK_ID)}/reflect`,
        {
          method: "POST",
          body: JSON.stringify({ query, budget: "mid", max_tokens: 2048 }),
        },
        90000
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.text || data.answer || data.response || "";
        if (text) {
          parts.push("\n=== HINDSIGHT REFLECT SYNTHESIS ===");
          parts.push(String(text));
        }
      }
    } catch {
      /* optional enrichment */
    }
  }

  return {
    reflection: parts.join("\n"),
    durationMs: Date.now() - start,
    mode,
  };
}

export async function seedMemories(
  items: {
    memoryId: string;
    content: string;
    service?: string;
    category?: string;
    timestamp?: string;
  }[]
): Promise<{
  seeded: number;
  skipped: number;
  errors: string[];
  mode: HindsightMode;
}> {
  const mode = getMode();
  let seeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (mode === "live") {
    await ensureBank();
    for (const item of items) {
      const docId = item.memoryId.startsWith("incident-")
        ? item.memoryId
        : `incident-${item.memoryId.replace(/^seed_/, "")}`;
      const result = await retainMemory({
        content: item.content,
        documentId: docId,
        context: item.category || "resolved_incident",
        timestamp: item.timestamp,
        metadata: {
          service: item.service || "",
          category: item.category || "resolved_incident",
          source: "seed",
        },
        tags: item.service
          ? [`service:${item.service}`, "source:seed"]
          : ["source:seed"],
      });
      if (result.success) seeded++;
      else {
        errors.push(`${item.memoryId}: ${result.error}`);
        skipped++;
      }
    }
    return { seeded, skipped, errors, mode };
  }

  for (const item of items) {
    const existing = await prisma.demoMemory.findUnique({
      where: { memoryId: item.memoryId },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.demoMemory.create({
      data: {
        memoryId: item.memoryId,
        content: item.content,
        service: item.service || null,
        category: item.category || "incident",
      },
    });
    seeded++;
  }
  return { seeded, skipped, errors, mode };
}

export { BANK_ID, getMode, BASE_URL };

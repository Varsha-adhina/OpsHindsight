import Groq from "groq-sdk";
import { hasGroqKey } from "./utils";

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

let client: Groq | null = null;

function getClient(): Groq | null {
  if (!hasGroqKey()) return null;
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

export async function chatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { temperature?: number; maxTokens?: number; json?: boolean }
): Promise<{ content: string; model: string; durationMs: number; error?: string }> {
  const start = Date.now();
  const c = getClient();
  if (!c) {
    return {
      content: "",
      model: MODEL,
      durationMs: Date.now() - start,
      error: "GROQ_API_KEY not configured — using deterministic demo responses",
    };
  }
  try {
    const completion = await c.chat.completions.create({
      model: MODEL,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 4096,
      response_format: options?.json ? { type: "json_object" } : undefined,
    });
    const content = completion.choices[0]?.message?.content || "";
    return { content, model: MODEL, durationMs: Date.now() - start };
  } catch (e) {
    return {
      content: "",
      model: MODEL,
      durationMs: Date.now() - start,
      error: e instanceof Error ? e.message : "Groq request failed",
    };
  }
}

export { MODEL };

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recallMemories } from "@/lib/hindsight";

const Schema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(20).optional(),
  service: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = Schema.parse(body);
    const result = await recallMemories({
      query: data.query,
      limit: data.limit,
      filters: data.service ? { service: data.service } : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Recall failed" }, { status: 500 });
  }
}

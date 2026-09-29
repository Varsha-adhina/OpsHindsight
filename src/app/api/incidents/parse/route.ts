import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseAlertText } from "@/lib/incident-agent";

const Schema = z.object({ rawText: z.string().min(1).max(50000) });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawText } = Schema.parse(body);
    const parsed = await parseAlertText(rawText);
    return NextResponse.json({ parsed });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}

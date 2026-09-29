import { NextResponse } from "next/server";
import { SEEDED_INCIDENTS, buildMemoryContent } from "@/lib/seed-data";
import { seedMemories } from "@/lib/hindsight";

export async function POST() {
  const items = SEEDED_INCIDENTS.map((inc) => ({
    memoryId: `seed_${inc.externalId}`,
    content: buildMemoryContent(inc),
    service: inc.service,
    category: "resolved_incident",
  }));
  const result = await seedMemories(items);
  return NextResponse.json(result);
}

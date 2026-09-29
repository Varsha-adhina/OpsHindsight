import { PrismaClient } from "@prisma/client";
import {
  SEEDED_INCIDENTS,
  SEEDED_RUNBOOKS,
  buildMemoryContent,
} from "../src/lib/seed-data";
import { seedMemories, getMode, ensureBank, BANK_ID } from "../src/lib/hindsight";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding OpsHindsight...");
  console.log(`   Hindsight mode: ${getMode()}`);
  console.log(`   Bank ID: ${BANK_ID}`);

  // Runbooks (Prisma only)
  for (const rb of SEEDED_RUNBOOKS) {
    await prisma.runbook.upsert({
      where: { name: rb.name },
      create: rb,
      update: {
        successCount: rb.successCount,
        failureCount: rb.failureCount,
        averageResolutionMinutes: rb.averageResolutionMinutes,
        description: rb.description,
      },
    });
  }
  console.log(`  ✓ ${SEEDED_RUNBOOKS.length} runbooks`);

  // Prisma incidents + resolutions
  let incidentCount = 0;
  for (const inc of SEEDED_INCIDENTS) {
    const existing = await prisma.incident.findUnique({
      where: { externalId: inc.externalId },
    });
    if (existing) continue;

    const incident = await prisma.incident.create({
      data: {
        externalId: inc.externalId,
        title: inc.title,
        service: inc.service,
        environment: inc.environment,
        severity: inc.severity,
        status: inc.status,
        alertType: inc.alertType,
        errorSignature: inc.errorSignature,
        rawAlert: inc.rawAlert,
        customerImpact: inc.customerImpact,
        startedAt: inc.startedAt,
        resolvedAt: inc.resolvedAt,
      },
    });
    incidentCount++;

    await prisma.incidentResolution.create({
      data: {
        incidentId: incident.id,
        rootCause: inc.rootCause,
        successfulSteps: inc.successfulSteps,
        failedSteps: inc.failedSteps,
        runbook: inc.runbook,
        preventiveActions: inc.preventiveActions,
        customerImpact: inc.customerImpact,
        durationMinutes: inc.durationMinutes,
        feedback: inc.lessons,
      },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "resolved",
        content: `Resolved: ${inc.rootCause}`,
        author: "seed",
        result: "success",
        timestamp: inc.resolvedAt!,
      },
    });
  }
  console.log(`  ✓ ${incidentCount} new Prisma incidents (${SEEDED_INCIDENTS.length} total target)`);

  // REAL Hindsight retain (or DemoMemory when DEMO_MODE)
  // document_id = incident-INC-1042 for idempotent re-seed
  if (getMode() === "live") {
    const bank = await ensureBank();
    if (!bank.ok) {
      console.error("  ✗ Failed to ensure Hindsight bank:", bank.error);
    } else {
      console.log("  ✓ Hindsight bank ensured");
    }
  }

  const memoryItems = SEEDED_INCIDENTS.map((inc) => ({
    memoryId: `incident-${inc.externalId}`,
    content: buildMemoryContent(inc),
    service: inc.service,
    category: "resolved_incident",
    timestamp: inc.startedAt.toISOString(),
  }));

  console.log(`  → Retaining ${memoryItems.length} incident memories into Hindsight (${getMode()})...`);
  const result = await seedMemories(memoryItems);
  console.log(`  ✓ Hindsight retain: seeded=${result.seeded} skipped=${result.skipped} mode=${result.mode}`);
  if (result.errors.length) {
    console.warn("  ⚠ retain errors:");
    for (const e of result.errors) console.warn("   ", e);
  }

  // Also keep local DemoMemory mirror for Memory Explorer offline viewing
  for (const inc of SEEDED_INCIDENTS) {
    const memId = `seed_${inc.externalId}`;
    await prisma.demoMemory.upsert({
      where: { memoryId: memId },
      create: {
        memoryId: memId,
        content: buildMemoryContent(inc),
        service: inc.service,
        category: "resolved_incident",
        metadata: JSON.stringify({
          externalId: inc.externalId,
          severity: inc.severity,
          documentId: `incident-${inc.externalId}`,
        }),
      },
      update: {},
    });
  }
  console.log("  ✓ Local DemoMemory mirror updated (explorer fallback only)");

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

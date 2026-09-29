/**
 * Verifies MemoryOperation rows can be written and read from the same Prisma DB.
 * Run: npx tsx scripts/test-memory-ops.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("DATABASE_URL =", process.env.DATABASE_URL);

  // Probe: can we write?
  const row = await prisma.memoryOperation.create({
    data: {
      operationType: "recall",
      status: "success",
      query: "test-probe",
      resultCount: 1,
      summary: "test-memory-ops probe — safe to ignore",
    },
  });
  console.log("[MemoryOperation] RECALL probe persisted id=", row.id);

  const counts = {
    total: await prisma.memoryOperation.count(),
    recallSuccess: await prisma.memoryOperation.count({
      where: { operationType: "recall", status: "success" },
    }),
    retainSuccess: await prisma.memoryOperation.count({
      where: { operationType: "retain", status: "success" },
    }),
    reflectSuccess: await prisma.memoryOperation.count({
      where: { operationType: "reflect", status: "success" },
    }),
  };
  console.log("counts =", counts);

  // cleanup probe
  await prisma.memoryOperation.delete({ where: { id: row.id } });
  console.log("probe deleted; remaining total =", await prisma.memoryOperation.count());
}

main()
  .catch((e) => {
    console.error("FAILED — MemoryOperation table may be missing. Run: npx prisma db push");
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * One-shot verification that the pg_trgm extension is installed and the GIN
 * trigram indexes declared in schema.prisma made it onto each entity table.
 * Also runs an EXPLAIN on a representative ILIKE query to confirm the
 * planner picks the trigram index instead of a Seq Scan.
 *
 * Run with: `npx tsx scripts/verify-trigram-indexes.ts`
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
  // 1. Extension installed?
  const ext = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
  `;
  console.log("pg_trgm extension:", ext.length > 0 ? "INSTALLED" : "MISSING");

  // 2. Trigram indexes per table.
  const tables = [
    "ChangeLog",
    "FieldChangeOrder",
    "Rfi",
    "Pco",
    "Trend",
  ];
  for (const t of tables) {
    const idx = await prisma.$queryRaw<
      { indexname: string; indexdef: string }[]
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = ${t}
        AND indexdef ILIKE '%gin_trgm_ops%'
      ORDER BY indexname
    `;
    console.log(`\n${t}: ${idx.length} trigram index(es)`);
    for (const i of idx) console.log("  ", i.indexname);
  }

  // 3. Force the planner off Seq Scan inside one transaction so we can see
  //    the index path the optimizer has available. At the table's current
  //    row count the optimizer correctly prefers Seq Scan (cheaper than
  //    any index for tiny tables); this shows what happens once the table
  //    grows enough for the planner to switch on its own.
  const plan = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return tx.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN SELECT id FROM "ChangeLog"
      WHERE "title" ILIKE '%test%' OR "description" ILIKE '%test%'
      LIMIT 6
    `;
  });
  console.log(
    "\nEXPLAIN for ILIKE query on ChangeLog (seqscan off — shows index path):",
  );
  for (const r of plan) console.log("  ", r["QUERY PLAN"]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

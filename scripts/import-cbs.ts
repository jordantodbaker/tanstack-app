// Re-imports the CBS master from `prisma/data/cbs.csv` into the `CbsItem` table
// WITHOUT touching anything else (projects, FEF rows, change logs, etc.).
//
// Unlike the full `seedBaseData()`, this preserves each project's CBS allow-list:
// it upserts by the unique `costCode`, so existing items keep their row id (and
// therefore their `ProjectAllowedFefCbsItems` join rows). Items whose costCode no
// longer appears in the CSV are deleted (their allow-list entries cascade away —
// the code is gone). Brand-new items are created but NOT auto-added to any
// allow-list; the run reports how many, so you can grant them in Setup if needed.
//
// Run:  npx tsx scripts/import-cbs.ts
import "dotenv/config";
import { prisma } from "../src/server/db";
import { loadCbsItems } from "../prisma/seed";

async function main() {
  const items = loadCbsItems();

  // Guard: costCode is the upsert key and is @unique — refuse to run on data
  // that would violate it rather than fail halfway through.
  const byCost = new Map(items.map((i) => [i.costCode, i]));
  const emptyCost = items.filter((i) => i.costCode.trim() === "").length;
  if (emptyCost > 0 || byCost.size !== items.length) {
    throw new Error(
      `CSV not loadable: ${emptyCost} empty costCode(s), ` +
        `${items.length - byCost.size} duplicate costCode(s). Fix cbs.csv first.`,
    );
  }

  const existing = await prisma.cbsItem.findMany({ select: { costCode: true } });
  const existingCodes = new Set(existing.map((e) => e.costCode));
  const newCodes = new Set(items.map((i) => i.costCode));

  const toDelete = [...existingCodes].filter((c) => !newCodes.has(c));
  const toCreate = items.filter((i) => !existingCodes.has(i.costCode));
  const toUpdate = items.filter((i) => existingCodes.has(i.costCode));

  console.log(
    `CSV rows: ${items.length} | DB existing: ${existingCodes.size}`,
  );
  console.log(
    `Plan → create ${toCreate.length}, update ${toUpdate.length}, delete (stale) ${toDelete.length}`,
  );

  if (toDelete.length) {
    const del = await prisma.cbsItem.deleteMany({
      where: { costCode: { in: toDelete } },
    });
    console.log(`Deleted ${del.count} stale CbsItems.`);
  }

  for (let i = 0; i < toCreate.length; i += 500) {
    await prisma.cbsItem.createMany({ data: toCreate.slice(i, i + 500) });
  }
  if (toCreate.length) console.log(`Created ${toCreate.length} new CbsItems.`);

  let updated = 0;
  for (const it of toUpdate) {
    // Update in place — keeps the row id, so allow-list join rows survive.
    await prisma.cbsItem.update({ where: { costCode: it.costCode }, data: it });
    updated++;
    if (updated % 1000 === 0) {
      console.log(`  updated ${updated}/${toUpdate.length}…`);
    }
  }
  console.log(`Updated ${updated} existing CbsItems.`);

  const finalCount = await prisma.cbsItem.count();
  console.log(`\nFinal CbsItem count: ${finalCount}`);

  const projs = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { allowedFefCbsItems: true } },
    },
    orderBy: { id: "asc" },
  });
  console.log("Project CBS allow-lists after import:");
  for (const p of projs) {
    const gap = finalCount - p._count.allowedFefCbsItems;
    const note =
      p._count.allowedFefCbsItems > 0 && gap > 0
        ? `  (← ${gap} CBS items NOT in this allow-list)`
        : "";
    console.log(
      `  project ${p.id} ${p.name}: ${p._count.allowedFefCbsItems} allowed${note}`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

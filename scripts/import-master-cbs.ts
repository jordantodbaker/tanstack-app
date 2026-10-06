// Re-imports the CBS Dictionary from `prisma/data/MasterCBS.xlsx` into the
// `CbsItem` table WITHOUT touching anything else (projects, FEF rows, change
// logs, etc.). This is the regular "the CBS changed" process:
//
//   1. Drop the new workbook in at prisma/data/MasterCBS.xlsx
//   2. npm run cbs:import -- --dry-run     (review the plan + workbook report)
//   3. npm run cbs:import
//
// Unlike the full `seedBaseData()`, this preserves each project's CBS allow-list:
// it upserts by the unique `costCode`, so existing items keep their row id (and
// therefore their `ProjectAllowedFefCbsItems` join rows). Items whose costCode no
// longer appears in the dictionary are deleted (their allow-list entries cascade
// away — the code is gone). Brand-new items (including newly generated S/M
// twins) are created but NOT auto-added to any allow-list; the run reports how
// many, so you can grant them in Setup if needed.
//
// Existing rows are compared column-by-column against the workbook and only
// the ones that actually differ are written (in small parallel batches), so a
// routine re-import after a small workbook edit is a handful of round trips
// rather than one per row.
//
// Run:  npx tsx scripts/import-master-cbs.ts [--dry-run]
import "dotenv/config";
import { prisma } from "../src/server/db";
import {
  formatMasterCbsReport,
  loadMasterCbs,
  type MasterCbsItem,
} from "../prisma/master-cbs";
import {
  CBS_IMPORT_FIELDS,
  changedCbsFields,
  type CbsImportField,
} from "../src/lib/cbs-import-diff";

const dryRun = process.argv.includes("--dry-run");
// Parallel updates per batch — kept at the adapter's default pool size so a
// batch never queues on connections.
const CHUNK = 10;

async function main() {
  const { items, report } = await loadMasterCbs();
  console.log(formatMasterCbsReport(report));

  // Guard: costCode is the upsert key and is @unique — refuse to run on data
  // that would violate it rather than fail halfway through.
  const byCost = new Map(items.map((i) => [i.costCode, i]));
  if (byCost.size !== items.length) {
    throw new Error(
      `Dictionary not loadable: ${items.length - byCost.size} duplicate costCode(s) after expansion.`,
    );
  }

  const existing = await prisma.cbsItem.findMany({
    select: Object.fromEntries(
      [...CBS_IMPORT_FIELDS, "costCode"].map((f) => [f, true]),
    ) as { [K in CbsImportField | "costCode"]: true },
  });
  const existingByCost = new Map(existing.map((e) => [e.costCode, e]));

  const toDelete = existing
    .filter((e) => !byCost.has(e.costCode))
    .map((e) => e.costCode);
  const toCreate = items.filter((i) => !existingByCost.has(i.costCode));
  const toUpdate: { costCode: string; data: Partial<MasterCbsItem> }[] = [];
  let unchanged = 0;
  for (const it of items) {
    const prior = existingByCost.get(it.costCode);
    if (!prior) continue;
    const diff = changedCbsFields(prior, it);
    if (diff) toUpdate.push({ costCode: it.costCode, data: diff });
    else unchanged++;
  }

  console.log(
    `\nDictionary rows: ${items.length} | DB existing: ${existing.length}`,
  );
  console.log(
    `Plan → create ${toCreate.length}, update ${toUpdate.length}, unchanged ${unchanged}, delete (stale) ${toDelete.length}`,
  );
  if (dryRun) {
    if (toDelete.length) {
      console.log(`Stale codes (first 20): ${toDelete.slice(0, 20).join(", ")}`);
    }
    if (toUpdate.length) {
      const sample = toUpdate
        .slice(0, 10)
        .map((u) => `${u.costCode} [${Object.keys(u.data).join(", ")}]`)
        .join("; ");
      console.log(`Changed rows (first 10): ${sample}`);
    }
    console.log("\n--dry-run: no changes written.");
    return;
  }

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

  // Update in place — keeps the row id, so allow-list join rows survive.
  // Rows are updated in small parallel batches rather than one transaction
  // per chunk: a 200-row transaction exceeds Prisma's 5 s transaction limit
  // against a remote pooler, and atomicity isn't needed — each update is
  // keyed by costCode and the change detection above makes a re-run after a
  // partial failure pick up exactly where it left off.
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((u) =>
        prisma.cbsItem.update({ where: { costCode: u.costCode }, data: u.data }),
      ),
    );
    console.log(
      `  updated ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length}…`,
    );
  }
  console.log(`Updated ${toUpdate.length} changed CbsItems (${unchanged} unchanged).`);

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

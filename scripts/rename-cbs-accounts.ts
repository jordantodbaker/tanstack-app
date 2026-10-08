// Renames individual CBS accounts in the `CbsItem` table.
//
// An account's name comes from the "Name" column of
// `prisma/data/CBS.xlsx`, so this script is only half of a rename: it
// makes the app show the new name NOW, but the next `npm run cbs:import` will
// read the workbook again and put the old name back. Change the workbook cell
// too (the table below records which one) or the rename will not stick.
//
// Only `name` and the derived `displayDescription` change. Cost codes, ids and
// every project's allow-list are untouched, so nothing downstream moves.
//
// Run:  npx tsx scripts/rename-cbs-accounts.ts [--dry-run]
import "dotenv/config";
import { prisma } from "../src/server/db";
import {
  cbsDisplayDescription,
  planCbsRenames,
  type CbsRename,
} from "../src/lib/cbs-rename-plan";

const dryRun = process.argv.includes("--dry-run");

/**
 * The renames to apply. `workbookCell` is where the same edit belongs in
 * CBS.xlsx (sheet "Master CBS", column H = "Name"), so a future import
 * carries the new name rather than reverting it.
 */
const RENAMES: CbsRename[] = [
  {
    // The 300 division covers shop fabrication (300–312) AND field erection
    // (330–390), so the division name should not say "Shop Fabrication".
    displayCode: "300-00-0000-00-0",
    from: "Structural Steel Shop Fabrication",
    to: "Structural Steel",
    workbookCell: "H1999",
  },
  {
    // Likewise 600 covers the pipe shop (601–629) and field install
    // (630–680). The shop's own accounts keep their "Pipe Shop …" names.
    displayCode: "600-00-0000-00-0",
    from: "Pipe Shop",
    to: "Piping",
    workbookCell: "H3228",
  },
];

async function main() {
  const rows = await prisma.cbsItem.findMany({
    where: { displayCode: { in: RENAMES.map((r) => r.displayCode) } },
    select: { id: true, displayCode: true, name: true },
  });

  // The decision per entry — including the refusal rule — lives in
  // src/lib/cbs-rename-plan.ts so it can be unit-tested without a database.
  const outcomes = planCbsRenames(RENAMES, rows);
  const todo: { id: number; displayCode: string; to: string }[] = [];
  for (const o of outcomes) {
    switch (o.kind) {
      case "missing":
        console.log(`  SKIP   ${o.displayCode} — not in the catalog`);
        break;
      case "current":
        console.log(`  OK     ${o.displayCode} already "${o.name}"`);
        break;
      case "stale":
        console.log(
          `  STALE  ${o.displayCode} is "${o.actual}", expected "${o.expected}" — left alone`,
        );
        break;
      case "rename":
        console.log(`  RENAME ${o.displayCode} "${o.from}" → "${o.to}"`);
        todo.push({ id: o.id, displayCode: o.displayCode, to: o.to });
        break;
    }
  }

  if (todo.length === 0) {
    console.log("\nNothing to do.");
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: no changes written.");
    return;
  }

  for (const t of todo) {
    await prisma.cbsItem.update({
      where: { id: t.id },
      data: {
        name: t.to,
        displayDescription: cbsDisplayDescription(t.displayCode, t.to),
      },
    });
  }
  console.log(`\nRenamed ${todo.length} account(s).`);
  console.log("Remember the workbook, or the next CBS import reverts this:");
  for (const r of RENAMES) {
    console.log(`  CBS.xlsx "Master CBS" ${r.workbookCell} → ${r.to}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

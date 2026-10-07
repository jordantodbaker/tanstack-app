// Renames individual CBS accounts in the `CbsItem` table.
//
// An account's name comes from the "Name" column of
// `prisma/data/MasterCBS.xlsx`, so this script is only half of a rename: it
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

const dryRun = process.argv.includes("--dry-run");

/**
 * The renames to apply. `workbookCell` is where the same edit belongs in
 * MasterCBS.xlsx (sheet "Master CBS", column H = "Name"), so a future import
 * carries the new name rather than reverting it.
 */
const RENAMES: {
  displayCode: string;
  from: string;
  to: string;
  workbookCell: string;
}[] = [
  {
    // The 300 division covers shop fabrication (300–312) AND field erection
    // (330–390), so the division name should not say "Shop Fabrication".
    displayCode: "300-00-0000-00-0",
    from: "Structural Steel Shop Fabrication",
    to: "Structural Steel",
    workbookCell: "H2001",
  },
  {
    // Likewise 600 covers the pipe shop (601–629) and field install
    // (630–680). The shop's own accounts keep their "Pipe Shop …" names.
    displayCode: "600-00-0000-00-0",
    from: "Pipe Shop",
    to: "Piping",
    workbookCell: "H3230",
  },
];

async function main() {
  const codes = RENAMES.map((r) => r.displayCode);
  const rows = await prisma.cbsItem.findMany({
    where: { displayCode: { in: codes } },
    select: { id: true, displayCode: true, name: true },
  });
  const byCode = new Map(rows.map((r) => [r.displayCode, r]));

  const todo: { id: number; displayCode: string; to: string }[] = [];
  for (const r of RENAMES) {
    const row = byCode.get(r.displayCode);
    if (!row) {
      console.log(`  SKIP   ${r.displayCode} — not in the catalog`);
      continue;
    }
    if (row.name === r.to) {
      console.log(`  OK     ${r.displayCode} already "${r.to}"`);
      continue;
    }
    if (row.name !== r.from) {
      // Refuse rather than overwrite a name nobody expected — the workbook
      // may have been re-imported with something different since.
      console.log(
        `  STALE  ${r.displayCode} is "${row.name}", expected "${r.from}" — left alone`,
      );
      continue;
    }
    console.log(`  RENAME ${r.displayCode} "${row.name}" → "${r.to}"`);
    todo.push({ id: row.id, displayCode: r.displayCode, to: r.to });
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
        displayDescription: `${t.displayCode}:  ${t.to}`,
      },
    });
  }
  console.log(`\nRenamed ${todo.length} account(s).`);
  console.log("Remember the workbook, or the next CBS import reverts this:");
  for (const r of RENAMES) {
    console.log(`  MasterCBS.xlsx "Master CBS" ${r.workbookCell} → ${r.to}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

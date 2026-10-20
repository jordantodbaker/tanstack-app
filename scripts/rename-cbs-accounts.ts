// Renames individual CBS accounts, in the database and in the workbook.
//
// A rename has two halves. The database half makes the app show the new name
// now; the workbook half makes it survive, because `npm run cbs:import` reads
// the Name column of `prisma/data/CBS.xlsx` and puts the old name back
// otherwise. Doing only the first is why "Structural Steel" kept reverting.
//
//   npx tsx scripts/rename-cbs-accounts.ts --dry-run    see both halves
//   npx tsx scripts/rename-cbs-accounts.ts              database half
//   npx tsx scripts/rename-cbs-accounts.ts --workbook   both halves
//
// The workbook half is opt-in because CBS.xlsx is the master data file and is
// usually someone's open Excel window. It rewrites only the Name cells of the
// accounts listed below, leaving every other byte of the archive alone, and
// refuses rather than guessing if a cell is not where it expects.
//
// Only `name` and the derived `displayDescription` change in the database.
// Cost codes, ids and every project's allow-list are untouched, so nothing
// downstream moves.
import "dotenv/config";
import { prisma } from "../src/server/db";
import {
  cellAddress,
  cellText,
  openCbsSheet,
  writeCbsWorkbookCells,
} from "../prisma/cbs-workbook-cells";
import {
  cbsDisplayDescription,
  planCbsRenames,
  type CbsRename,
} from "../src/lib/cbs-rename-plan";

const dryRun = process.argv.includes("--dry-run");
const writeWorkbook = process.argv.includes("--workbook");

/**
 * The renames to apply. `workbookCell` records where the same edit belonged in
 * CBS.xlsx when the rename was written, so a future import carries the new name
 * rather than reverting it.
 *
 * The cell is also resolved against the workbook at run time, because a hand-
 * written reference goes stale on every revision: these two said sheet "Master
 * CBS" column H, and the 2026-10 workbook has one sheet ("CBS Expanded") with
 * Name in column G and Display Code in H. The reminder prints what the workbook
 * says today and only mentions the recorded cell when the two disagree.
 */
const RENAMES: CbsRename[] = [
  {
    // The 300 division covers shop fabrication (300–312) AND field erection
    // (330–390), so the division name should not say "Shop Fabrication".
    displayCode: "300-00-0000-00-0",
    from: "Structural Steel Shop Fabrication",
    to: "Structural Steel",
    workbookCell: "G3020",
  },
  {
    // Likewise 600 covers the pipe shop (601–629) and field install
    // (630–680). The shop's own accounts keep their "Pipe Shop …" names.
    displayCode: "600-00-0000-00-0",
    from: "Pipe Shop",
    to: "Piping",
    workbookCell: "G6296",
  },
];

/** Where a display code sits in the workbook today, and what it says there. */
type WorkbookName = {
  sheet: string;
  cell: string;
  /** The Name cell verbatim — cost-type suffix and all. */
  value: string;
};

/**
 * Finds the Name cell for each display code in the workbook the import reads.
 *
 * Headers are located by label rather than by a fixed column, and the sheet by
 * the loader's own precedence list, so this survives a re-ordered or renamed
 * workbook the same way the import does.
 */
async function resolveWorkbookNames(
  displayCodes: string[],
): Promise<Map<string, WorkbookName>> {
  const found = new Map<string, WorkbookName>();
  const sheet = await openCbsSheet();
  if (!sheet.column["Display Code"] || !sheet.column["Name"]) return found;

  const wanted = new Set(displayCodes);
  sheet.ws.eachRow((row, r) => {
    if (r === 1 || wanted.size === found.size) return;
    const code = cellText(sheet, row, "Display Code");
    if (!wanted.has(code) || found.has(code)) return;
    found.set(code, {
      sheet: sheet.ws.name,
      cell: cellAddress(sheet, "Name", r),
      value: cellText(sheet, row, "Name"),
    });
  });
  return found;
}

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
    console.log("\nNothing to rename in the database.");
  } else if (dryRun) {
    console.log("\n--dry-run: no changes written.");
  } else {
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
  }

  // Reported every run, including "nothing to rename" and --dry-run. The
  // workbook half is independent of the database half and is the one usually
  // left undone — and once the database is renamed the script has nothing left
  // to say about it, which is exactly when the reminder matters most.
  console.log("\nThe workbook half — the next CBS import reads these cells:");
  const inWorkbook = await resolveWorkbookNames(
    RENAMES.map((r) => r.displayCode),
  );
  const pending: { cell: string; value: string }[] = [];
  for (const r of RENAMES) {
    const at = inWorkbook.get(r.displayCode);
    if (!at) {
      console.log(
        `  MISSING ${r.displayCode} → "${r.to}" — not in the workbook (recorded as ${r.workbookCell}); an import cannot carry this name`,
      );
      continue;
    }
    // The loader strips the " (*)" / " (L)" cost-type suffix, so compare on the
    // stem rather than demanding an exact match.
    const stem = at.value.replace(/\s*\((?:\*|[A-Z])\)\s*$/, "").trim();
    // The recorded cell is a hand-written note; say so when it has drifted.
    const note =
      at.cell === r.workbookCell ? "" : ` (recorded as ${r.workbookCell})`;
    if (stem === r.to) {
      console.log(`  OK   "${at.sheet}" ${at.cell} already "${at.value}"`);
      continue;
    }
    console.log(
      `  EDIT "${at.sheet}" ${at.cell}: "${at.value}" → "${r.to}"${note}`,
    );
    // Keep whatever cost-type suffix the cell carried — "(*)" marks the
    // account's own row and the loader strips it on the way in, so dropping it
    // would be a second, silent edit.
    const suffix = /\s*\((?:\*|[A-Z])\)\s*$/.exec(at.value)?.[0] ?? "";
    pending.push({ cell: at.cell, value: `${r.to}${suffix}` });
  }

  if (pending.length === 0) {
    console.log("  nothing to change in the workbook.");
  } else if (dryRun) {
    console.log("\n  --dry-run: the workbook was not touched.");
  } else if (!writeWorkbook) {
    console.log(
      `\n  Re-run with --workbook to apply ${pending.length === 1 ? "that edit" : `those ${pending.length} edits`}, or the next import reverts the rename.`,
    );
  } else {
    const { cells } = await writeCbsWorkbookCells(pending);
    console.log(`\n  Wrote ${cells.join(", ")} to CBS.xlsx.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

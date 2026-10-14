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
import ExcelJS from "exceljs";
import { prisma } from "../src/server/db";
import { CBS_WORKBOOK_PATH, SHEET_NAMES } from "../prisma/cbs-workbook";
import {
  cbsDisplayDescription,
  planCbsRenames,
  type CbsRename,
} from "../src/lib/cbs-rename-plan";

const dryRun = process.argv.includes("--dry-run");

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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CBS_WORKBOOK_PATH);
  const ws =
    SHEET_NAMES.map((n) => wb.getWorksheet(n)).find(Boolean) ??
    wb.worksheets[0];
  if (!ws) return found;

  let codeCol = 0;
  let nameCol = 0;
  ws.getRow(1).eachCell((cell, n) => {
    const header = `${cell.value ?? ""}`.trim();
    if (header === "Display Code") codeCol = n;
    if (header === "Name") nameCol = n;
  });
  if (!codeCol || !nameCol) return found;

  const wanted = new Set(displayCodes);
  ws.eachRow((row, r) => {
    if (r === 1 || wanted.size === found.size) return;
    const code = `${row.getCell(codeCol).value ?? ""}`.trim();
    if (!wanted.has(code) || found.has(code)) return;
    found.set(code, {
      sheet: ws.name,
      cell: `${ws.getColumn(nameCol).letter}${r}`,
      value: `${row.getCell(nameCol).value ?? ""}`.trim(),
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
    console.log(
      stem === r.to
        ? `  OK   "${at.sheet}" ${at.cell} already "${at.value}"${note}`
        : `  EDIT "${at.sheet}" ${at.cell}: "${at.value}" → "${r.to}"${note}`,
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

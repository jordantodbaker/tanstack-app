// Repairs a freshly supplied copy of prisma/data/CBS.xlsx.
//
// Two defects have now arrived twice in a new copy of the workbook, and both
// are invisible until an import runs:
//
//   1. ~1,100 engineering rows whose Display Code carries its cost type twice
//      ("022-00-0000-00-0-S"). The loader rejects anything that is not
//      XXX-XX-XXXX-XX-X, so those rows never load — and `cbs:import` reads
//      their absence as "deleted", taking every project's grants with them.
//   2. The 95/96 division renumber: Specialty Services sits at 920 and
//      Startup & Commissioning at 950, where the sheet's own L1/L2 columns
//      say 95 and 96.
//
// Account RENAMES are not handled here. `cbs:rename -- --workbook` owns those,
// and duplicating them would give the same decision two homes. After this,
// run that too, then `cbs:import -- --dry-run`.
//
//   npm run cbs:repair                 see the plan, write nothing
//   npm run cbs:repair -- --apply      back up, then repair in place
//
// Writes only the cells it names, through `writeCbsWorkbookCells`.
import { copyFileSync } from "node:fs";
import { CBS_WORKBOOK_PATH } from "../prisma/cbs-workbook";
import {
  cellAddress,
  cellText,
  openCbsSheet,
  writeCbsWorkbookCells,
} from "../prisma/cbs-workbook-cells";
import {
  costCodeFor,
  planCbsWorkbookRepair,
  type RepairRow,
} from "../src/lib/cbs-workbook-repair";

const apply = process.argv.includes("--apply");

async function main() {
  const sheet = await openCbsSheet();
  const { ws } = sheet;
  for (const needed of ["Display Code", "Cost Code", "Name"]) {
    if (!sheet.column[needed]) {
      throw new Error(`${CBS_WORKBOOK_PATH}: no "${needed}" column on "${ws.name}"`);
    }
  }

  const rows: RepairRow[] = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    rows.push({
      row: r,
      displayCode: cellText(sheet, row, "Display Code"),
      name: cellText(sheet, row, "Name"),
    });
  });

  const { fixes, problems, skipped } = planCbsWorkbookRepair(rows);

  console.log(`${CBS_WORKBOOK_PATH} — sheet "${ws.name}", ${rows.length.toLocaleString()} rows`);
  const byReason = new Map<string, number>();
  for (const f of fixes) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
  console.log(`\nrows to repair: ${fixes.length.toLocaleString()}`);
  for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${reason}`);
  }
  for (const f of fixes.slice(0, 3)) {
    console.log(`     e.g. row ${f.row}: ${f.was} -> ${f.displayCode}`);
  }
  for (const f of fixes.filter((x) => x.reason === "division-renumber")) {
    console.log(`     row ${f.row}: ${f.was} -> ${f.displayCode} (${f.note})`);
  }
  for (const s of skipped) console.log(`  skipped: ${s}`);

  if (problems.length > 0) {
    console.error(`\nrefusing to write — ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 10)) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }
  if (fixes.length === 0) {
    console.log("\nNothing to repair.");
    return;
  }
  if (!apply) {
    console.log("\nRe-run with --apply to repair the file. Nothing written.");
    return;
  }

  // Each fix touches the display code and the cost code derived from it.
  const edits = fixes.flatMap((f) => [
    { cell: cellAddress(sheet, "Display Code", f.row), value: f.displayCode },
    {
      cell: cellAddress(sheet, "Cost Code", f.row),
      value: costCodeFor(f.displayCode),
    },
  ]);

  const backup = `${CBS_WORKBOOK_PATH}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  copyFileSync(CBS_WORKBOOK_PATH, backup);
  console.log(`\nbacked up to ${backup}`);

  const { cells, bytes } = await writeCbsWorkbookCells(edits);
  console.log(`wrote ${cells.length.toLocaleString()} cells (${bytes.toLocaleString()} bytes)`);
  console.log("\nNext: npm run cbs:rename -- --workbook, then npm run cbs:import -- --dry-run");
}

main().catch((err) => {
  if ((err as NodeJS.ErrnoException)?.code === "EBUSY") {
    console.error("CBS.xlsx is open in Excel — close it and run again.");
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

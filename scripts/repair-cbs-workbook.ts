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
// Writes only the cells it names, by editing the sheet XML inside the archive.
// exceljs would be less code but cannot round-trip the sheet's table
// definition (xl/tables/table1.xml), which this workbook has.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { CBS_WORKBOOK_PATH, SHEET_NAMES } from "../prisma/cbs-workbook";
import {
  costCodeFor,
  planCbsWorkbookRepair,
  type RepairRow,
} from "../src/lib/cbs-workbook-repair";

const apply = process.argv.includes("--apply");

/** Spreadsheet column letter for a 1-based index. */
function letter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - r - 1) / 26;
  }
  return s;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CBS_WORKBOOK_PATH);
  const ws =
    SHEET_NAMES.map((n) => wb.getWorksheet(n)).find(Boolean) ??
    wb.worksheets[0];
  if (!ws) throw new Error(`${CBS_WORKBOOK_PATH}: no sheets`);

  // Columns by header, never by position: this workbook has been re-ordered
  // before, and a fixed index would write into the wrong column silently.
  const column: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, n) => {
    column[`${cell.value ?? ""}`.trim()] = n;
  });
  for (const needed of ["Display Code", "Cost Code", "Name", "L7"]) {
    if (!column[needed]) {
      throw new Error(`${CBS_WORKBOOK_PATH}: no "${needed}" column on "${ws.name}"`);
    }
  }
  const text = (row: ExcelJS.Row, name: string) =>
    `${row.getCell(column[name]).value ?? ""}`.trim();

  const rows: RepairRow[] = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    rows.push({
      row: r,
      displayCode: text(row, "Display Code"),
      name: text(row, "Name"),
      l7: text(row, "L7"),
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

  // Each fix touches the display code, the cost code derived from it, and the
  // L7 column when that has fallen out of step.
  const edits = new Map<string, string>();
  for (const f of fixes) {
    edits.set(`${letter(column["Display Code"])}${f.row}`, f.displayCode);
    edits.set(`${letter(column["Cost Code"])}${f.row}`, costCodeFor(f.displayCode));
    if (f.l7) edits.set(`${letter(column["L7"])}${f.row}`, f.l7);
  }

  const backup = `${CBS_WORKBOOK_PATH}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  copyFileSync(CBS_WORKBOOK_PATH, backup);
  console.log(`\nbacked up to ${backup}`);

  const zip = await JSZip.loadAsync(readFileSync(CBS_WORKBOOK_PATH));
  const sheetPath = Object.keys(zip.files).find((f) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(f),
  );
  if (!sheetPath) throw new Error("no worksheet XML in the archive");
  let xml = await zip.file(sheetPath)!.async("string");

  const escape = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const [cell, value] of edits) {
    // `[^]` rather than a backslash class: this pattern is built in a template.
    const re = new RegExp(`<c r="${cell}"([^>]*?)(/>|>[^]*?</c>)`);
    const hit = re.exec(xml);
    if (!hit) throw new Error(`cell ${cell} not found — nothing written`);
    // Keep the style, drop the old type, write an inline string. That leaves
    // the shared-string table untouched, so no other cell is affected.
    const attrs = hit[1].replace(/\s*t="[^"]*"/, "");
    xml =
      xml.slice(0, hit.index) +
      `<c r="${cell}"${attrs} t="inlineStr"><is><t>${escape(value)}</t></is></c>` +
      xml.slice(hit.index + hit[0].length);
  }

  zip.file(sheetPath, xml);
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  writeFileSync(CBS_WORKBOOK_PATH, buffer);
  console.log(`wrote ${edits.size.toLocaleString()} cells (${buffer.length.toLocaleString()} bytes)`);
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

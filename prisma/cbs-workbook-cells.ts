/**
 * Reading and rewriting individual cells of the CBS workbook, for the scripts
 * that correct `prisma/data/CBS.xlsx` in place (`cbs:repair`, `cbs:rename`).
 *
 * The loader in `cbs-workbook.ts` only reads; this is the write side, kept in
 * one place because the cell-level XML edit is the fiddly part and two copies
 * of it had already started to drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { CBS_WORKBOOK_PATH, SHEET_NAMES } from "./cbs-workbook";

export type CbsSheet = {
  ws: ExcelJS.Worksheet;
  /** 1-based column index by header label, from row 1. */
  column: Record<string, number>;
};

/**
 * The sheet the loader reads — same name precedence, same fallback to the
 * first sheet — with its columns indexed by header.
 *
 * Columns by header, never by position: this workbook has had columns
 * inserted and removed, and a fixed index writes into the wrong cell silently.
 */
export async function openCbsSheet(
  path: string = CBS_WORKBOOK_PATH,
): Promise<CbsSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws =
    SHEET_NAMES.map((n) => wb.getWorksheet(n)).find(Boolean) ??
    wb.worksheets[0];
  if (!ws) throw new Error(`${path}: no sheets`);
  const column: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, n) => {
    column[`${cell.value ?? ""}`.trim()] = n;
  });
  return { ws, column };
}

/** A cell's text, trimmed, by header label. */
export const cellText = (sheet: CbsSheet, row: ExcelJS.Row, label: string) =>
  `${row.getCell(sheet.column[label]).value ?? ""}`.trim();

/** The A1 address of `label`'s cell on sheet row `row`. */
export const cellAddress = (sheet: CbsSheet, label: string, row: number) =>
  `${sheet.ws.getColumn(sheet.column[label]).letter}${row}`;

const escapeXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Rewrites cells in place, one zip entry replaced and nothing else touched.
 *
 * exceljs would be less code but cannot round-trip the sheet's table
 * definition (xl/tables/table1.xml), so the cell XML is edited directly. Each
 * rewritten cell keeps its style and becomes an inline string, which leaves the
 * shared-string table out of it entirely — no re-indexing, no other cell
 * affected.
 *
 * All or nothing: a cell that cannot be found throws before anything is
 * written, because a silent miss would look like success and revert on the
 * next import.
 */
export async function writeCbsWorkbookCells(
  edits: { cell: string; value: string }[],
  path: string = CBS_WORKBOOK_PATH,
): Promise<{ cells: string[]; bytes: number }> {
  if (edits.length === 0) return { cells: [], bytes: 0 };
  const zip = await JSZip.loadAsync(readFileSync(path));
  const sheetPath = Object.keys(zip.files).find((f) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(f),
  );
  if (!sheetPath) throw new Error(`${path}: no worksheet XML found`);
  let xml = await zip.file(sheetPath)!.async("string");

  for (const { cell, value } of edits) {
    // `[^]` rather than a backslash class: this pattern is built in a template.
    const re = new RegExp(`<c r="${cell}"([^>]*?)(/>|>[^]*?</c>)`);
    const hit = re.exec(xml);
    if (!hit) throw new Error(`${path}: cell ${cell} not found — nothing written`);
    const attrs = hit[1].replace(/\s*t="[^"]*"/, "");
    xml =
      xml.slice(0, hit.index) +
      `<c r="${cell}"${attrs} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>` +
      xml.slice(hit.index + hit[0].length);
  }

  zip.file(sheetPath, xml);
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  writeFileSync(path, buffer);
  return { cells: edits.map((e) => e.cell), bytes: buffer.length };
}

/**
 * Rewriting individual cells of a CBS workbook in place — the write side for
 * `cbs:rename -- --workbook`, which edits Name cells of the condensed master.
 *
 * The read side (`openCbsSheet`, `cellText`, `cellAddress`) lives in
 * `cbs-sheet.ts` and is re-exported here so a script needs one import.
 */
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

export {
  cellAddress,
  cellText,
  openCbsSheet,
  type CbsSheet,
} from "./cbs-sheet";

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
 *
 * `path` is required rather than defaulted: the generated `CBS.xlsx` is
 * overwritten by every `cbs:expand`, so a write that lands there by default
 * would be a write that quietly disappears.
 */
export async function writeCbsWorkbookCells(
  edits: { cell: string; value: string }[],
  path: string,
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
    if (!hit)
      throw new Error(`${path}: cell ${cell} not found — nothing written`);
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

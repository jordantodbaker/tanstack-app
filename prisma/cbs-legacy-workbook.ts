/**
 * Loads the legacy phase codes (`prisma/data/LegacyCBS.xlsx`), in sheet order.
 *
 * Not `loadCbsWorkbook`: that one keys on the `XXX-YY-ZZWW-VV-T` display code
 * and would reject every row here. Nothing is renumbered or de-duplicated:
 * these are a historical record, so a repeated code is kept twice, as the
 * sheet has it. The order matters: `buildCbsTree` nests legacy rows by it.
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stripTables } from "./cbs-sheet";

export const CBS_LEGACY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "data",
  "LegacyCBS.xlsx",
);

const REQUIRED = ["Cost Code", "Name", "Row Type", "Legacy", "Status"] as const;

const yes = (v: string): boolean => /^(yes|true)$/i.test(v);

export async function loadCbsLegacyWorkbook(path: string = CBS_LEGACY_PATH) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(stripTables(readFileSync(path))) as never);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`${path}: workbook has no sheets`);

  // The header sits under a title block; "Cost Code" in a cell of its own is
  // what marks it.
  const column = new Map<string, number>();
  let headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 15) && !headerRow; r++) {
    const found = new Map<string, number>();
    ws.getRow(r).eachCell((cell, c) => {
      found.set((cell.text ?? "").toString().trim(), c);
    });
    if (!found.has("Cost Code")) continue;
    headerRow = r;
    for (const [h, c] of found) column.set(h, c);
  }
  const missing = REQUIRED.filter((h) => !column.has(h));
  if (missing.length > 0) {
    throw new Error(`${path}: missing column(s) ${missing.join(", ")}`);
  }

  const read = (r: number) => {
    const row = ws.getRow(r);
    const text = (h: string): string => {
      const c = column.get(h);
      return c ? (row.getCell(c).text ?? "").toString().trim() : "";
    };
    const code = text("Cost Code").toUpperCase();
    if (!code) return null;
    // Every row is marked; one that is not is not ours to call legacy.
    if (!yes(text("Legacy"))) {
      throw new Error(`${path} row ${r}: ${code} is not marked Legacy = TRUE`);
    }
    const sourceRow = Number(text("Source Row"));
    return {
      code,
      name: text("Name"),
      uom: text("UOM"),
      rowType: text("Row Type"),
      laborCode: yes(text("Labor Code")),
      subReporting: yes(text("Sub Code")),
      materialCode: yes(text("Material Code")),
      equipmentCode: yes(text("Equipment Code")),
      otherCode: yes(text("Other Code")),
      rentalCode: yes(text("Rental Code")),
      legacyCostType: text("Legacy Cost Type") || null,
      l1Description: text("L1 Description") || null,
      l2Description: text("L2 Description") || null,
      l3Description: text("L3 Description") || null,
      notes: text("Notes") || null,
      status: text("Status") || null,
      sourceRow:
        Number.isInteger(sourceRow) && sourceRow > 0 ? sourceRow : null,
      l1Filled: yes(text("L1 Filled")),
      duplicateCode: yes(text("Duplicate Code")),
    };
  };
  const items: NonNullable<ReturnType<typeof read>>[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const item = read(r);
    if (item) items.push(item);
  }
  return items;
}

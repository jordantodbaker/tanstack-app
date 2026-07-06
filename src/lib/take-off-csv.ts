/**
 * CSV columns for exporting a Take Off sheet. The first five columns mirror the
 * "Paste from Excel" importer's column order (see TAKE_OFF_PASTE_COLUMNS), so an
 * exported sheet round-trips: export → edit in Excel → copy → paste back. The
 * trailing columns are reference/report only (paste ignores columns past the
 * fifth). Pure — no React — so the mapping is unit-tested.
 */
import type { CsvColumn } from "./csv-export";
import type { FefRow } from "./types";
import { fefRowHasUserData } from "./fef-helpers";

const codeOf = (r: FefRow): string =>
  r.id.startsWith("__fe-blank-") ? "" : r.id;

/** Labor hours × rate as a number for Excel; "" when not computable. */
const totalCost = (r: FefRow): number | "" => {
  const hours = parseFloat(r.laborHours);
  const rate = parseFloat(r.laborRate);
  return Number.isFinite(hours) && Number.isFinite(rate) && r.laborRate !== ""
    ? hours * rate
    : "";
};

/**
 * Build the Take Off CSV columns. `areaLabelFor` maps a stored area id to its
 * display label for the (importable) "Area" column; without it the raw id is
 * emitted (still importable — paste accepts the id too). The raw id is always
 * also emitted in the "Area ID" reference column.
 */
export function makeTakeOffCsvColumns(
  areaLabelFor: (areaId: string) => string = (id) => id,
): CsvColumn<FefRow>[] {
  return [
    // ── Paste round-trip columns (order must match TAKE_OFF_PASTE_COLUMNS) ──
    { header: "CBS Code", get: codeOf },
    { header: "Description", get: (r) => r.description },
    { header: "Quantity", get: (r) => r.quantity },
    { header: "Labor Factor", get: (r) => r.laborFactor },
    { header: "Labor Rate", get: (r) => r.laborRate },
    { header: "Area", get: (r) => (r.area ? areaLabelFor(r.area) : "") },
    // ── Reference columns (ignored on paste) ──
    { header: "Name", get: (r) => r.name },
    { header: "Unit", get: (r) => r.unit },
    { header: "Labor Hours", get: (r) => r.laborHours },
    { header: "Total Cost", get: totalCost },
    { header: "Area ID", get: (r) => r.area },
    { header: "Role", get: (r) => r.role },
    { header: "Schedule", get: (r) => r.schedule },
    { header: "Notes", get: (r) => r.notes },
  ];
}

/** Default columns (area shown as its raw id). Use `makeTakeOffCsvColumns` with
 *  an area-label resolver for human-readable Area labels. */
export const takeOffCsvColumns: CsvColumn<FefRow>[] = makeTakeOffCsvColumns();

/** Real rows worth exporting — drops blank template rows (the trailing
 *  auto-blank, empty seeded rows). */
export function takeOffRowsForExport(rows: FefRow[]): FefRow[] {
  return rows.filter(
    (r) => !(r.id.startsWith("__fe-blank-") && !fefRowHasUserData(r)),
  );
}

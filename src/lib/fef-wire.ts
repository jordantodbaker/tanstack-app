import { FEF_ROW_STRING_FIELDS, makeFefRow } from "./fef-helpers";
import type { FefRow } from "./types";

/**
 * How a take-off row travels between the grid and the server.
 *
 * A `FefRow` has 59 string fields and most of them are "" on most rows, so a
 * 444-row piping sheet is about 450 KB each way on every autosave, nearly
 * all of it empty quotes. On the wire a row is its id plus only the fields
 * that hold something; `expandFefRow` puts the blanks back. Both the save
 * request and its response use this, and the server's validator accepts a
 * full row too, so an older client is still understood.
 *
 * Pure — shared by the hook, the server function and its validator.
 */

export type SparseFefRow = { id: string } & Partial<
  Record<(typeof FEF_ROW_STRING_FIELDS)[number], string>
>;

/** The row with its empty fields left out. */
export function compactFefRow(row: FefRow): SparseFefRow {
  const out: SparseFefRow = { id: row.id };
  for (const f of FEF_ROW_STRING_FIELDS) {
    const v = row[f];
    if (v !== "") out[f] = v;
  }
  return out;
}

/** The full row, every field present. Idempotent on a full row. */
export function expandFefRow(sparse: SparseFefRow): FefRow {
  return makeFefRow(sparse);
}

/** What `saveFefRows` returns. */
export type FefSaveResult = {
  /** The sheet as persisted, re-read in position order, compacted. */
  rows: SparseFefRow[];
  /** The sidebar's invalid-row badge counts for the version, after the save. */
  invalidByDiscipline: Record<string, number>;
};

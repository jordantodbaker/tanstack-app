/**
 * Change detection for the CBS re-import (`scripts/import-cbs.ts`):
 * which stored columns differ from the freshly loaded dictionary row. Kept
 * pure so the rule — including "null and empty string are different" — is
 * unit-tested without a database.
 */
import type { CbsDictionaryRow } from "./cbs-dictionary";

/** Every column the import writes, i.e. everything but the `costCode` key. */
export const CBS_IMPORT_FIELDS = [
  "l1",
  "l2",
  "l3",
  "l4",
  "l5",
  "l6",
  "name",
  "displayCode",
  "uom",
  "subReporting",
  "materialCode",
  "materialType",
  "costCenter",
  "costClassification",
  "status",
  "accountDescription",
  "l2Description",
  "core",
  "coreExtension",
  "wbs",
  "p6CostAccount",
  "gl",
  "discipline",
  "description",
  "notes",
  "displayDescription",
  "rowType",
  "generatedFrom",
] as const satisfies readonly (keyof CbsDictionaryRow)[];

export type CbsImportField = (typeof CBS_IMPORT_FIELDS)[number];

/** A stored row as the import reads it back. Stored columns are nullable
 *  where the workbook value is not (e.g. displayDescription). */
export type StoredCbsRow = {
  [K in CbsImportField]: CbsDictionaryRow[K] | null;
} & { costCode: string };

/**
 * The subset of columns in `next` that differ from the stored row, or null
 * when nothing changed. Strict equality: `null` ≠ `""`, `false` ≠ `null`.
 */
export function changedCbsFields(
  existing: StoredCbsRow,
  next: CbsDictionaryRow,
): Partial<CbsDictionaryRow> | null {
  let diff: Partial<CbsDictionaryRow> | null = null;
  for (const f of CBS_IMPORT_FIELDS) {
    if (existing[f] !== next[f]) {
      (diff ??= {})[f] = next[f] as never;
    }
  }
  return diff;
}

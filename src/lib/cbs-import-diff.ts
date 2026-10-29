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
  "laborCode",
  "equipmentCode",
  "otherCode",
  "rentalCode",
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
  "originalRow",
  "expandedRow",
  "isOriginal",
] as const satisfies readonly (keyof CbsDictionaryRow)[];

export type CbsImportField = (typeof CBS_IMPORT_FIELDS)[number];

/** A stored row as the import reads it back. Stored columns are nullable
 *  where the workbook value is not (e.g. displayDescription). */
export type StoredCbsRow = {
  [K in CbsImportField]: CbsDictionaryRow[K] | null;
} & { costCode: string };

/**
 * Each import field's Postgres type, for the bulk update below. A `Record`
 * over the field union, so adding a field to `CBS_IMPORT_FIELDS` fails to
 * compile until it is typed here — the alternative is a column the bulk update
 * silently stops writing.
 */
const SQL_TYPE: Record<CbsImportField, string> = {
  l1: "text",
  l2: "text",
  l3: "text",
  l4: "text",
  l5: "text",
  l6: "text",
  name: "text",
  displayCode: "text",
  uom: "text",
  subReporting: "boolean",
  materialCode: "boolean",
  laborCode: "boolean",
  equipmentCode: "boolean",
  otherCode: "boolean",
  rentalCode: "boolean",
  materialType: "text",
  costCenter: "text",
  costClassification: "text",
  status: "text",
  accountDescription: "text",
  l2Description: "text",
  core: "text",
  coreExtension: "text",
  wbs: "text",
  p6CostAccount: "text",
  gl: "text",
  discipline: "text",
  description: "text",
  notes: "text",
  displayDescription: "text",
  // Read as text from the JSON, cast to the enum on the way in.
  rowType: "text",
  generatedFrom: "text",
  originalRow: "integer",
  expandedRow: "integer",
  isOriginal: "boolean",
};

/** Fields whose database column has a different name (`@map` in the schema). */
const DB_COLUMN: Partial<Record<CbsImportField, string>> = {
  originalRow: "masterCbsRow",
};

/**
 * One `UPDATE … FROM jsonb_to_recordset($1)` that rewrites every import column
 * of every row in the JSON array, matched on `costCode`.
 *
 * The import used to send one `update` per changed row, ten at a time — about
 * 800 round trips for the 2026-10 workbook against a remote pooler. This is
 * one statement per batch. It writes whole rows rather than only the changed
 * columns: the values are the workbook's either way, so the result is the
 * same, and one statement shape serves every row.
 */
export function cbsBulkUpdateSql(): string {
  const set = CBS_IMPORT_FIELDS.map((f) => {
    const value =
      f === "rowType" ? `v."${f}"::"CbsRowType"` : `v."${f}"`;
    return `"${DB_COLUMN[f] ?? f}" = ${value}`;
  });
  const record = [
    `"costCode" text`,
    ...CBS_IMPORT_FIELDS.map((f) => `"${f}" ${SQL_TYPE[f]}`),
  ];
  return (
    `UPDATE "CbsItem" AS c SET ${set.join(", ")} ` +
    `FROM jsonb_to_recordset($1::jsonb) AS v(${record.join(", ")}) ` +
    `WHERE c."costCode" = v."costCode"`
  );
}

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

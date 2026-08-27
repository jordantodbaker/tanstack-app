import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "./types";
import type { CustomFieldSlot } from "./fef-helpers";
import { EditableCell } from "./fef-cells";
import type { ColumnGroup } from "./fef-table-types";

/**
 * Turning user-defined column definitions into grid columns.
 *
 * A definition is only a `(slot, label)` pair — the data already lives in
 * `FefRow.custom{slot}`, which is an ordinary string field. So the column is an
 * ordinary accessor on that field with the label as its header, editing through
 * the same plain-text cell as Description or Notes. Nothing about the row, the
 * write path or the range operations needs to know these columns are special.
 *
 * The column `id` is the SLOT field (`custom3`), never the label. Saved widths,
 * column visibility and the range-selection machinery are all keyed by column
 * id, so a rename must not look like a different column to any of them.
 */

const columnHelper = createColumnHelper<FefRow>();

/** What `buildCustomFieldColumns` needs from a definition. */
export type CustomFieldColumnSpec = {
  /** The `customN` field this column reads and writes. */
  field: string;
  label: string;
};

/** Default width, in px. Wide enough for a tag number, narrow enough that ten
 *  of them don't dominate the sheet. */
export const CUSTOM_FIELD_COLUMN_WIDTH = 140;

export function buildCustomFieldColumns(
  specs: readonly CustomFieldColumnSpec[],
): ColumnDef<FefRow, string>[] {
  return specs
    // A definition whose slot is out of range resolves to no field. Skipping
    // beats rendering a column bound to nothing — the row would show blank
    // cells that silently discard whatever was typed into them.
    .filter((s) => s.field !== "")
    .map(
      (s) =>
        columnHelper.accessor(s.field as CustomFieldSlot, {
          id: s.field,
          header: s.label,
          cell: EditableCell,
          size: CUSTOM_FIELD_COLUMN_WIDTH,
        }) as ColumnDef<FefRow, string>,
    );
}

/**
 * Append the custom columns to a sheet's column list.
 *
 * They go at the end rather than at a configured index: the fixed columns are
 * ordered to match how an estimator works down a line item, and letting a
 * user-defined column land in the middle of that would disrupt a layout every
 * other discipline shares.
 */
export function withCustomFieldColumns(
  base: ColumnDef<FefRow, string>[],
  specs: readonly CustomFieldColumnSpec[],
): ColumnDef<FefRow, string>[] {
  const custom = buildCustomFieldColumns(specs);
  return custom.length === 0 ? base : [...base, ...custom];
}

/**
 * The chip-only group that collapses every custom column at once.
 *
 * `banner: false` keeps it out of the grouped-header band: the band spans
 * contiguous columns, and while custom columns are contiguous today, a chip is
 * the honest representation of "a set the user assembled" rather than a
 * structural section of the sheet.
 *
 * Returns null when there are none, so the chip row shows nothing rather than
 * an empty toggle.
 */
export function customFieldColumnGroup(
  specs: readonly CustomFieldColumnSpec[],
): ColumnGroup | null {
  const columnIds = specs.map((s) => s.field).filter((f) => f !== "");
  return columnIds.length === 0
    ? null
    : { label: "Custom", columnIds, banner: false };
}

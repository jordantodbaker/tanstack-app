import type { FefRow } from "./types";
import { isTakeOffRowInvalid } from "./fef-helpers";

/**
 * The Take Off toolbar's "errors only" view filter.
 *
 * A row is in error when the user has started it but Total Cost can't be
 * computed — the same `isTakeOffRowInvalid` predicate that tints the row red,
 * counts the sidebar's warning badge, and drives the Validation page. One
 * predicate, so the button can never disagree with the tint next to it.
 *
 * The filter is *pinned*, not live. A live predicate would be self-defeating
 * here: the moment you type the missing labor rate the row becomes valid and
 * would vanish from under the cursor, mid-edit. So switching the filter on
 * captures the rows in error at that moment and keeps showing them while you
 * work — they lose their red tint as you fix them, which is the feedback you
 * want — and rows that fall INTO error while the filter is on are added to the
 * view rather than hidden by it.
 *
 * Rows are identified by their index in the sheet's data array, which is the
 * only identity a `FefRow` has (see `updateData` in `table-utils.tsx`, which
 * addresses rows the same way). Indices are stable while rows are only edited
 * or appended to; an insert or delete in the middle shifts them, so the caller
 * drops the filter when the row count changes rather than showing the wrong
 * rows.
 */

/** Table column that carries the filter. Hidden — it renders nothing. */
export const ERROR_FILTER_COLUMN_ID = "__invalid";

/** Data indices of every row currently in error. */
export function invalidRowIndices(rows: FefRow[]): Set<number> {
  const out = new Set<number>();
  rows.forEach((row, index) => {
    if (isTakeOffRowInvalid(row)) out.add(index);
  });
  return out;
}

/** How many rows are in error. Cheaper than building the set to read `.size`. */
export function countInvalidRows(rows: FefRow[]): number {
  let n = 0;
  for (const row of rows) if (isTakeOffRowInvalid(row)) n++;
  return n;
}

/**
 * Whether a row survives the errors-only filter: it was in error when the
 * filter was switched on, or it is in error now.
 */
export function isRowInErrorFilter(
  row: FefRow,
  index: number,
  pinned: ReadonlySet<number>,
): boolean {
  return pinned.has(index) || isTakeOffRowInvalid(row);
}

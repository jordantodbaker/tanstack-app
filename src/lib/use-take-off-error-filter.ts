import * as React from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import type { FefTableState } from "~/lib/fef-table-types";
import { isTakeOffRowInvalid } from "~/lib/fef-helpers";
import {
  ERROR_FILTER_COLUMN_ID,
  countInvalidRows,
  invalidRowIndices,
  isRowInErrorFilter,
} from "~/lib/take-off-errors";

const columnHelper = createColumnHelper<FefRow>();

/**
 * Zero-width hidden column carrying the "errors only" view filter for the Take
 * Off sheet. A column filter rather than a global one: TanStack evaluates a
 * column filter once per row, while a global filter fans out over every column
 * (and is skipped unless a column opts in), so this costs less on a 400-row
 * sheet and can't be silently disabled by whichever columns a discipline
 * defines. It renders nothing — the filter value does the work. Append it to
 * the grid's columns and hide it via `takeOffErrorFilterColumnVisibility`.
 */
export const takeOffErrorFilterColumn: ColumnDef<FefRow, string> =
  columnHelper.accessor((row) => (isTakeOffRowInvalid(row) ? "1" : ""), {
    id: ERROR_FILTER_COLUMN_ID,
    header: () => null,
    cell: () => null,
    size: 0,
    filterFn: (row, _columnId, pinned: ReadonlySet<number>) =>
      isRowInErrorFilter(row.original, row.index, pinned),
  }) as ColumnDef<FefRow, string>;

/** Spread into the grid's `columnVisibility` to keep the carrier column hidden. */
export const takeOffErrorFilterColumnVisibility: VisibilityState = {
  [ERROR_FILTER_COLUMN_ID]: false,
};

/**
 * State machine behind the "Errors only" toolbar toggle. The count is live (it
 * drops as rows are fixed), but the *filter* pins the row indices that were in
 * error when it was switched on, so a row doesn't vanish mid-edit the instant
 * it becomes valid. A row insert/delete renumbers every row below the change,
 * which would leave the pinned indices pointing at rows that were never in
 * error — so a change in row count drops the filter rather than show the wrong
 * rows (rows are otherwise only edited or appended). See `take-off-errors.ts`.
 */
export function useTakeOffErrorFilter(state: FefTableState): {
  errorCount: number;
  errorsOnly: boolean;
  toggleErrorsOnly: () => void;
} {
  const { data: rows, columnFilters, setColumnFilters } = state;

  const errorCount = React.useMemo(() => countInvalidRows(rows), [rows]);
  const errorsOnly = columnFilters.some((f) => f.id === ERROR_FILTER_COLUMN_ID);

  const clearErrorFilter = React.useCallback(() => {
    setColumnFilters((prev) =>
      prev.filter((f) => f.id !== ERROR_FILTER_COLUMN_ID),
    );
  }, [setColumnFilters]);

  const toggleErrorsOnly = React.useCallback(() => {
    setColumnFilters((prev) => {
      const without = prev.filter((f) => f.id !== ERROR_FILTER_COLUMN_ID);
      if (prev.length !== without.length) return without;
      return [
        ...without,
        { id: ERROR_FILTER_COLUMN_ID, value: invalidRowIndices(rows) },
      ];
    });
  }, [setColumnFilters, rows]);

  const rowCount = rows.length;
  const lastRowCount = React.useRef(rowCount);
  React.useEffect(() => {
    if (lastRowCount.current === rowCount) return;
    lastRowCount.current = rowCount;
    if (errorsOnly) clearErrorFilter();
  }, [rowCount, errorsOnly, clearErrorFilter]);

  return { errorCount, errorsOnly, toggleErrorsOnly };
}

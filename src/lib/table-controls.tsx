import React from "react";
import type { FefRow } from "~/lib/types";

/*
 * The controls around the FEF grid rather than in its cells: the pager under
 * it and the per-column value filter in its header.
 */

type PaginatableTable = {
  firstPage: () => void;
  previousPage: () => void;
  nextPage: () => void;
  lastPage: () => void;
  getCanPreviousPage: () => boolean;
  getCanNextPage: () => boolean;
  getPageCount: () => number;
  getState: () => { pagination: { pageIndex: number } };
  getFilteredRowModel: () => { rows: unknown[] };
};

export function TablePagination({
  table,
  totalCount,
}: {
  table: PaginatableTable;
  totalCount?: number;
}) {
  const rowCount = totalCount ?? table.getFilteredRowModel().rows.length;
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.firstPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<<"}
        </button>
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </button>
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {">"}
        </button>
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.lastPage()}
          disabled={!table.getCanNextPage()}
        >
          {">>"}
        </button>
      </div>
      <span>
        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} &mdash; {rowCount} rows
      </span>
    </div>
  );
}

export function ColumnFilter({
  column,
  data,
}: {
  column: {
    id: string;
    getFilterValue: () => unknown;
    setFilterValue: (v: unknown) => void;
  };
  data: FefRow[];
}) {
  const value = (column.getFilterValue() ?? "") as string;
  const [activated, setActivated] = React.useState(false);

  // Cheap gate that preserves the old "no values → render nothing" behavior:
  // `.some` short-circuits at the first defined value, so it's O(1) for real
  // data columns and only scans fully for the few display columns that have
  // none. This is the only work done per edit for an un-opened filter.
  const hasValues = React.useMemo(
    () => data.some((row) => row[column.id as keyof FefRow] !== undefined),
    [data, column.id],
  );

  // The expensive part — distinct values + Set + sort over the whole array — is
  // deferred until the user shows intent to use this filter (hover or focus).
  // Otherwise ~40 header filters would each rebuild this on every commit/paste,
  // for dropdowns that are rarely opened. `null` = not built yet.
  const options = React.useMemo(() => {
    if (!activated) return null;
    return Array.from(
      new Set(
        data
          .map((row) => row[column.id as keyof FefRow])
          .filter((v): v is string => v !== undefined),
      ),
    ).sort();
  }, [activated, data, column.id]);

  if (!hasValues) return null;

  const activate = () => setActivated(true);

  return (
    <select
      className="mt-1 w-full border border-gray-300 px-1 py-0.5 text-xs font-normal rounded focus:border-blue-400 focus:outline-none bg-white"
      value={value}
      onMouseEnter={activate}
      onFocus={activate}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
    >
      <option value="">All</option>
      {/* Keep the active selection selectable before the options materialize. */}
      {value !== "" && !(options ?? []).includes(value) && (
        <option value={value}>{value}</option>
      )}
      {(options ?? []).map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

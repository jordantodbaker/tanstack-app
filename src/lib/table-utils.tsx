import React from "react";
import { useReactTable } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import { computeBoreSize } from "./utils";

export const editableCellClass =
  "w-full bg-white border border-slate-200 px-2 py-1 text-sm hover:border-blue-300 focus:border-blue-400 focus:outline-none rounded";

export const readOnlyCellClass =
  "block px-2 py-1 text-sm text-slate-500 bg-slate-100";

export function makeBlankRow(i: number): FefRow {
  return {
    id: `__fe-blank-${i}`,
    description: "",
    shopField: "",
    weldGroupDescription: "",
    quantity: "",
    size: "",
    unit: "",
    metallurgyCode: "",
    boreSize: "",
    role: "",
    schedule: "",
    taskCode: "",
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  };
}

export const TAKE_OFF_INITIAL_ROWS: FefRow[] = Array.from(
  { length: 25 },
  (_, i) => makeBlankRow(i),
);

export const FIELD_ESTIMATE_INITIAL_ROWS: FefRow[] = [];

export function useTakeOffSync(
  source: { data: FefRow[] },
  target: { setData: React.Dispatch<React.SetStateAction<FefRow[]>> },
) {
  const syncedIds = React.useRef(new Set<string>());

  return () => {
    const qualifiedRows = source.data.filter(
      (r) => Number(r.quantity) > 0 && !r.id.startsWith("__fe-blank-"),
    );
    const qualifiedIds = new Set(qualifiedRows.map((r) => r.id));
    const qualifiedMap = new Map(qualifiedRows.map((r) => [r.id, r]));
    const prevSyncedIds = syncedIds.current;

    target.setData((prev) => {
      const prevIds = new Set(prev.map((r) => r.id));
      const retained = prev
        .filter((r) => !prevSyncedIds.has(r.id) || qualifiedIds.has(r.id))
        .map((r) => (qualifiedMap.has(r.id) ? { ...qualifiedMap.get(r.id)! } : r));
      const added = qualifiedRows
        .filter((r) => !prevIds.has(r.id))
        .map((r) => ({ ...r }));
      return [...retained, ...added];
    });

    syncedIds.current = qualifiedIds;
  };
}

export function EditableCell({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const initialValue = getValue() as string;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    table.options.meta?.updateData?.(row.index, column.id, value);
  };

  return (
    <input
      className={editableCellClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function SizeCell({
  getValue,
  row,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const initialValue = getValue() as string;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    table.options.meta?.updateRow?.(row.index, {
      size: value,
      boreSize: computeBoreSize(value),
    });
  };

  return (
    <input
      className={editableCellClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function CbsSelectCell({
  row,
  table,
}: {
  getValue: () => unknown;
  row: { index: number; original: FefRow };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const currentDisplayCode = row.original.id;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = cbsOptions.find((o) => o.displayCode === e.target.value);
    if (selected) {
      table.options.meta?.updateRow?.(row.index, {
        id: selected.displayCode,
        description: selected.name,
        unit: selected.uom,
      });
    }
  };

  return (
    <select
      className={editableCellClass}
      value={currentDisplayCode}
      onChange={handleChange}
    >
      <option value="">-- Select --</option>
      {cbsOptions.map((opt) => (
        <option key={opt.displayCode} value={opt.displayCode}>
          {opt.displayDescription ?? `${opt.displayCode}: ${opt.name}`}
        </option>
      ))}
    </select>
  );
}

export function TakeOffIdCell({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const raw = getValue() as string;
  const initialValue = raw.startsWith("__fe-blank-") ? "" : raw;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(raw.startsWith("__fe-blank-") ? "" : raw);
  }, [raw]);

  const onBlur = () => {
    table.options.meta?.updateData?.(row.index, column.id, value);
  };

  return (
    <input
      className={editableCellClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function TakeOffIdReadOnlyCell({ getValue }: { getValue: () => unknown }) {
  const raw = getValue() as string;
  const value = raw.startsWith("__fe-blank-") ? "" : raw;
  return (
    <span className={readOnlyCellClass}>{value}</span>
  );
}

export function ReadOnlyCell({ getValue }: { getValue: () => unknown }) {
  return (
    <span className={readOnlyCellClass}>
      {getValue() as string}
    </span>
  );
}

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
  const options = React.useMemo(
    () =>
      Array.from(new Set(data.map((row) => row[column.id as keyof FefRow]))).sort(),
    [data, column.id],
  );

  return (
    <select
      className="mt-1 w-full border border-gray-300 px-1 py-0.5 text-xs font-normal rounded focus:border-blue-400 focus:outline-none bg-white"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
    >
      <option value="">All</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

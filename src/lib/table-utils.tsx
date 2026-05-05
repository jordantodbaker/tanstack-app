import React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type VisibilityState,
  type PaginationState,
  type RowData,
  type TableMeta,
} from "@tanstack/react-table";
import type { CbsOption, FefRow } from "~/lib/types";
import { computeBoreSize } from "./utils";
import {
  getMaterialsSectionRows,
  setMaterialsSectionRows,
} from "./materialsStore";

export const editableCellClass =
  "w-full bg-white border border-slate-200 px-2 py-1 text-sm hover:border-blue-300 focus:border-blue-400 focus:outline-none rounded";

export const readOnlyCellClass =
  "block px-2 py-1 text-sm text-slate-500 bg-slate-100";

export function makeBlankRow(i: number): FefRow {
  return {
    id: `__fe-blank-${i}`,
    name: "",
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
  return () => {
    const qualifiedRows = source.data.filter(
      (r) => Number(r.quantity) > 0 && !r.id.startsWith("__fe-blank-"),
    );

    type Agg = { baseRow: FefRow; qty: number; hours: number; cost: number };
    const groups = new Map<string, Agg>();

    for (const row of qualifiedRows) {
      const qty = parseFloat(row.quantity) || 0;
      const hours = parseFloat(row.laborHours) || 0;
      const rate = parseFloat(row.laborRate) || 0;
      const existing = groups.get(row.id);
      if (!existing) {
        groups.set(row.id, { baseRow: row, qty, hours, cost: hours * rate });
      } else {
        existing.qty += qty;
        existing.hours += hours;
        existing.cost += hours * rate;
      }
    }

    const aggregated: FefRow[] = Array.from(groups.values()).map(
      ({ baseRow, qty, hours, cost }) => ({
        ...baseRow,
        quantity: String(qty),
        laborHours: String(hours),
        laborRate: hours > 0 ? String(cost / hours) : "",
      }),
    );

    target.setData(aggregated);
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
        name: selected.name,
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

export function CbsNameCell({
  row,
  table,
}: {
  getValue: () => unknown;
  row: { original: FefRow };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const match = cbsOptions.find((o) => o.displayCode === row.original.id);
  return (
    <span className={readOnlyCellClass}>{match?.name ?? row.original.name}</span>
  );
}

export function CbsUomCell({
  row,
  table,
}: {
  getValue: () => unknown;
  row: { original: FefRow };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const match = cbsOptions.find((o) => o.displayCode === row.original.id);
  return (
    <span className={readOnlyCellClass}>{match?.uom ?? row.original.unit}</span>
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
      Array.from(
        new Set(
          data
            .map((row) => row[column.id as keyof FefRow])
            .filter((v): v is string => v !== undefined),
        ),
      ).sort(),
    [data, column.id],
  );

  if (options.length === 0) return null;

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

// ── Shared FEF table state + content ────────────────────────────────────────

type RoleRate = { roleName: string; schedule: string; rate: number };

export type TaskCodeOption = { code: string; taskDefinition: string };

export type FefTableMeta = {
  cbsOptions?: CbsOption[];
  weldGroupOptions?: string[];
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >;
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: RoleRate[];
  taskCodeOptions?: TaskCodeOption[];
  pipingFactorLookup?: Map<
    string,
    { unit: string; values: Map<number, number> }
  >;
};

export type FefTableState = {
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
};

export type ServerPagination = {
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function useFefTableState(opts: {
  initialRows?: FefRow[];
  /** Persists row data in the materials store under this key when set. */
  sectionKey?: string;
} = {}): FefTableState {
  const { initialRows, sectionKey } = opts;

  const [data, setDataState] = React.useState<FefRow[]>(() => {
    if (sectionKey) {
      const cached = getMaterialsSectionRows(sectionKey);
      if (cached) return cached;
    }
    return initialRows ?? TAKE_OFF_INITIAL_ROWS;
  });
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([]);

  const setData = React.useCallback<
    React.Dispatch<React.SetStateAction<FefRow[]>>
  >(
    (updater) => {
      setDataState((old) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: FefRow[]) => FefRow[])(old)
            : updater;
        if (sectionKey) setMaterialsSectionRows(sectionKey, next);
        return next;
      });
    },
    [sectionKey],
  );

  React.useEffect(() => {
    if (sectionKey) return;
    if (initialRows !== undefined) setDataState(initialRows);
  }, [initialRows, sectionKey]);

  return { data, setData, columnFilters, setColumnFilters };
}

export function FefTableContent({
  state,
  meta,
  columns,
  serverPagination,
  columnVisibility,
  onColumnVisibilityChange,
}: {
  state: FefTableState;
  meta?: FefTableMeta;
  columns: ColumnDef<FefRow, string>[];
  serverPagination?: ServerPagination;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: React.Dispatch<React.SetStateAction<VisibilityState>>;
}) {
  const { data, setData, columnFilters, setColumnFilters } = state;
  const [localPageIndex, setLocalPageIndex] = React.useState(0);

  const pagination: PaginationState = serverPagination
    ? {
        pageIndex: serverPagination.pageIndex,
        pageSize: serverPagination.pageSize,
      }
    : { pageIndex: localPageIndex, pageSize: 25 };

  const table = useReactTable({
    data,
    columns,
    manualPagination: !!serverPagination,
    pageCount: serverPagination
      ? Math.ceil(serverPagination.totalCount / serverPagination.pageSize)
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      if (serverPagination) {
        serverPagination.onPageChange(next.pageIndex);
      } else {
        setLocalPageIndex(next.pageIndex);
      }
    },
    onColumnVisibilityChange,
    state: { columnFilters, pagination, ...(columnVisibility !== undefined && { columnVisibility }) },
    meta: {
      cbsOptions: meta?.cbsOptions ?? [],
      weldGroupOptions: meta?.weldGroupOptions ?? [],
      weldGroupMaterialMap: meta?.weldGroupMaterialMap ?? {},
      roleOptions: meta?.roleOptions ?? [],
      scheduleOptions: meta?.scheduleOptions ?? [],
      roleRates: meta?.roleRates ?? [],
      taskCodeOptions: meta?.taskCodeOptions ?? [],
      pipingFactorLookup: meta?.pipingFactorLookup,
      updateData: (rowIndex: number, columnId: string, value: string) => {
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, [columnId]: value } : row,
          ),
        );
      },
      updateRow: (rowIndex: number, updates: Record<string, string>) => {
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, ...updates } : row,
          ),
        );
      },
    } satisfies TableMeta<RowData>,
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-gray-100">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ minWidth: header.column.getSize() }}
                  className="border border-gray-300 px-3 py-2 text-left font-semibold"
                >
                  <div className="flex flex-col gap-1">
                    <span className="whitespace-nowrap">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </span>
                    <ColumnFilter column={header.column} data={data} />
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{ minWidth: cell.column.getSize() }}
                  className="border border-gray-300"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        table={table}
        totalCount={serverPagination?.totalCount}
      />
    </div>
  );
}

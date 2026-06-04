import React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type VisibilityState,
  type PaginationState,
  type RowData,
  type TableMeta,
} from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import type { CbsOption, FefRow } from "~/lib/types";
import { computeBoreSize } from "./utils";
import {
  getMaterialsSectionRows,
  setMaterialsSectionRows,
} from "./materialsStore";
import { aggregateTakeOff } from "./take-off-sync";
import { createDebug } from "./logger";
import { canComputeTotalCost, makeFefRow } from "./fef-helpers";

const debug = createDebug("fef");

export const editableCellClass =
  "w-full bg-white border border-slate-200 px-2 py-1 text-sm hover:border-blue-300 focus:border-blue-400 focus:outline-none rounded";

export const readOnlyCellClass =
  "block px-2 py-1 text-sm text-slate-500 bg-slate-100";

/**
 * Props every FEF table cell renderer receives from TanStack Table. Cells
 * destructure only what they need; this is the shared maximal shape.
 */
export type CellProps = {
  getValue: () => unknown;
  row: { index: number; original: FefRow };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
};

/**
 * Editable text input whose value commits on blur. Holds a local draft so
 * keystrokes don't churn table state; resyncs when the underlying value
 * changes. `stripBlankPrefix` blanks the synthetic `__fe-blank-*` row ids.
 */
export function TextCell({
  value: rawValue,
  stripBlankPrefix = false,
  onCommit,
}: {
  value: string;
  stripBlankPrefix?: boolean;
  onCommit: (value: string) => void;
}) {
  const normalize = (v: string) =>
    stripBlankPrefix && v.startsWith("__fe-blank-") ? "" : v;
  const [value, setValue] = React.useState(() => normalize(rawValue));

  React.useEffect(() => {
    setValue(
      stripBlankPrefix && rawValue.startsWith("__fe-blank-") ? "" : rawValue,
    );
  }, [rawValue, stripBlankPrefix]);

  return (
    <input
      className={editableCellClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
    />
  );
}

export function makeBlankRow(i: number): FefRow {
  return makeFefRow({ id: `__fe-blank-${i}` });
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
    target.setData(aggregateTakeOff(source.data));
  };
}

export function EditableCell({ getValue, row, column, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
    />
  );
}

export function SizeCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(v) =>
        table.options.meta?.updateRow?.(row.index, {
          size: v,
          boreSize: computeBoreSize(v),
        })
      }
    />
  );
}

export function CbsSelectCell({ row, table }: CellProps) {
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

export function TakeOffIdCell({ getValue, row, column, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      stripBlankPrefix
      onCommit={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
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

/**
 * Default Labor Factor when a row hasn't been explicitly set. 1.0 → labor
 * hours equals quantity, which is the lowest-surprise baseline for users
 * who don't know what factor to enter.
 */
const DEFAULT_LABOR_FACTOR = "1";

/**
 * Resolves a row's effective labor factor: the row-stored value if the user
 * typed one, otherwise the hardcoded `DEFAULT_LABOR_FACTOR`.
 */
function effectiveLaborFactor(storedFactor: string): string {
  return storedFactor !== "" ? storedFactor : DEFAULT_LABOR_FACTOR;
}

/** Derived labor hours = quantity × labor factor, formatted to 1dp. Returns
 *  "" when either input isn't a positive finite number. */
function computeLaborHours(quantity: string, factor: string): string {
  const q = parseFloat(quantity);
  const f = parseFloat(factor);
  if (!Number.isFinite(q) || !Number.isFinite(f)) return "";
  return (q * f).toFixed(1);
}

/**
 * Labor-factor input for the dynamic disciplines' Take Off sheet. Empty
 * rows display `DEFAULT_LABOR_FACTOR` so a brand-new row produces a
 * meaningful labor-hours estimate (labor hours == quantity) without
 * further input. Typing overrides the default and stamps the row;
 * clearing reverts to the default on the next render.
 */
export function LaborFactorInputCell({ getValue, row, table }: CellProps) {
  const stored = (getValue() as string) ?? "";
  return (
    <TextCell
      value={effectiveLaborFactor(stored)}
      onCommit={(v) => {
        const next = v.trim();
        // Storing the default verbatim is wasteful — leave the row empty
        // so a future change to `DEFAULT_LABOR_FACTOR` still flows through.
        const persisted = next === DEFAULT_LABOR_FACTOR ? "" : next;
        const newLaborHours = computeLaborHours(
          row.original.quantity,
          effectiveLaborFactor(persisted),
        );
        table.options.meta?.updateRow?.(row.index, {
          laborFactor: persisted,
          laborHours: newLaborHours,
        });
      }}
    />
  );
}

/**
 * Quantity input that, beyond storing the typed value, recomputes the
 * row's `laborHours` from the new quantity × the effective labor factor.
 * Keeps `laborHours` authoritative so the read-only Labor Hours cell and
 * the downstream Total Cost cell don't need to know about the factor.
 */
export function LaborFactorQuantityCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(v) => {
        const newLaborHours = computeLaborHours(
          v,
          effectiveLaborFactor(row.original.laborFactor),
        );
        table.options.meta?.updateRow?.(row.index, {
          quantity: v,
          laborHours: newLaborHours,
        });
      }}
    />
  );
}

/**
 * Read-only Labor Hours display for the dynamic disciplines. Recomputes
 * on every render from `quantity × effective factor` so rows migrated in
 * from before this column existed (stored `laborHours` may be stale)
 * still display the right number.
 */
export function ComputedLaborHoursCell({ row }: CellProps) {
  return (
    <span className={readOnlyCellClass}>
      {computeLaborHours(
        row.original.quantity,
        effectiveLaborFactor(row.original.laborFactor),
      )}
    </span>
  );
}

/**
 * Take Off row-selection checkbox. Disabled until the row can compute a
 * Total Cost (i.e. has both labor hours and rate); a ticked checkbox marks
 * the row for the "Duplicate Selected Rows" action.
 */
export function SelectionCheckboxCell({ row, table }: CellProps) {
  const selectable = canComputeTotalCost(row.original);
  const selectedSet = table.options.meta?.selectedRowIndices;
  const checked = selectable && (selectedSet?.has(row.index) ?? false);
  const onToggle = table.options.meta?.onToggleRowSelected;
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        aria-label="Select row for duplication"
        checked={checked}
        disabled={!selectable}
        onChange={() => onToggle?.(row.index)}
        className={
          selectable
            ? "h-4 w-4 cursor-pointer accent-[#a63434]"
            : "h-4 w-4 cursor-not-allowed accent-slate-400 opacity-50"
        }
      />
    </div>
  );
}

export function DeleteRowCell({ row, table }: CellProps) {
  const onDelete = table.options.meta?.deleteRow;
  // Don't allow deleting the trailing auto-appended blank row — the table
  // always wants one undeletable blank slot at the bottom for new entries.
  const data = table.options.data as FefRow[];
  const isTrailingBlank =
    row.index === data.length - 1 &&
    row.original.id.startsWith("__fe-blank-");
  if (isTrailingBlank) {
    return <div className="flex h-7 items-center justify-center" />;
  }
  return (
    <div className="flex items-center justify-center">
      <button
        type="button"
        aria-label="Delete row"
        title="Delete row"
        onClick={() => onDelete?.(row.index)}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Read-only cell that mirrors a field from the row's matched CBS option. */
function CbsLookupCell({
  row,
  table,
  field,
}: Pick<CellProps, "row" | "table"> & { field: "name" | "uom" }) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const match = cbsOptions.find((o) => o.displayCode === row.original.id);
  const fallback = field === "name" ? row.original.name : row.original.unit;
  return (
    <span className={readOnlyCellClass}>{match?.[field] ?? fallback}</span>
  );
}

export function CbsNameCell(props: CellProps) {
  return <CbsLookupCell {...props} field="name" />;
}

export function CbsUomCell(props: CellProps) {
  return <CbsLookupCell {...props} field="uom" />;
}

/**
 * Dropdown of areas for the current project. Stores the selected area's id
 * (as a string) on the row's `area` field; options come from
 * `meta.areaOptions`.
 */
export function AreaSelectCell({ getValue, row, column, table }: CellProps) {
  const value = getValue() as string;
  const areaOptions = table.options.meta?.areaOptions ?? [];
  return (
    <select
      className={editableCellClass}
      value={value}
      onChange={(e) =>
        table.options.meta?.updateData?.(row.index, column.id, e.target.value)
      }
    >
      <option value="">-- Select --</option>
      {areaOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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
export type AreaSelectOption = { value: string; label: string };
export type CrewMixOption = {
  id: number;
  name: string;
  members: { jobTitle: string; wage: number }[];
};

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
  crewMixOptions?: CrewMixOption[];
  taskCodeOptions?: TaskCodeOption[];
  pipingFactorLookup?: Map<
    string,
    { unit: string; values: Map<number, number> }
  >;
  areaOptions?: AreaSelectOption[];
  selectedRowIndices?: Set<number>;
  onToggleRowSelected?: (rowIndex: number) => void;
  /** Optional override for the default delete behavior. Lets callers also
   *  adjust ancillary state (e.g. selection sets) atomically with deletion. */
  deleteRow?: (rowIndex: number) => void;
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

/**
 * Memoized table row. The big perf win for the FEF / Piping take-off: with
 * 50+ rows × ~20 cells each, an unmemoized typing burst re-renders every
 * cell on every keystroke because the parent's `data` array reference flips
 * on each immutable update. The memo's comparator skips re-render when the
 * underlying row data and zebra position are unchanged — so only the row
 * actually being edited (and any rows that genuinely shifted) re-render.
 *
 * Trade-off: if `table.options.meta` legitimately changes (e.g. the
 * `cbsOptions` query finishes loading after the table has mounted), rows
 * already rendered with stale meta would otherwise keep their old dropdown
 * contents until their underlying data changes. The `metaRev` prop is a
 * memoized identity that flips whenever a query-derived meta array
 * (roleOptions, cbsOptions, etc.) changes reference — including it in the
 * comparator forces every row to re-render with fresh meta after a refetch,
 * without giving up the per-keystroke memoization win for editing.
 */
const FefTableRow = React.memo(
  function FefTableRow({
    row,
    rowIndex,
    selected: _selected,
    metaRev: _metaRev,
    getRowInvalid,
  }: {
    row: Row<FefRow>;
    rowIndex: number;
    /** Participates in the memo comparator so a selection toggle re-renders
     *  just this row. Cells read selection state from `table.options.meta`. */
    selected: boolean;
    /** Memo-only identity that flips when the meta arrays sourced from
     *  queries (roleOptions, cbsOptions, etc.) change reference. */
    metaRev: object;
    getRowInvalid?: (row: FefRow) => boolean;
  }) {
    void _selected;
    void _metaRev;
    const invalid = getRowInvalid?.(row.original) ?? false;
    // Invalid rows get a faint red wash + thicker red left border so they
    // stand out against the alternating zebra without obscuring the inputs.
    const baseBg = rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50";
    const rowClass = invalid
      ? `${baseBg} bg-red-50 border-l-4 border-l-red-500`
      : baseBg;
    return (
      <tr
        className={rowClass}
        title={
          invalid
            ? "Invalid — labor hours and rate are required to compute Total Cost."
            : undefined
        }
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
    );
  },
  (prev, next) =>
    // Reference-equality on `row.original` is correct because the FEF state
    // setter does immutable updates: only the edited row gets a new object;
    // sibling rows keep the same reference. `getRowInvalid` is expected to
    // be a stable module-level function (e.g. `isTakeOffRowInvalid`).
    // `selected` participates so a checkbox toggle re-renders just the
    // affected row, not every row in the table. `metaRev` flips only when a
    // query-derived meta array changes reference, so query refetches (e.g.
    // an admin added a Role) re-render every row's dropdowns with fresh
    // options without disturbing the editing-speed memoization.
    prev.row.original === next.row.original &&
    prev.rowIndex === next.rowIndex &&
    prev.selected === next.selected &&
    prev.metaRev === next.metaRev &&
    prev.getRowInvalid === next.getRowInvalid,
);

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

  return { data, setData, columnFilters, setColumnFilters };
}

export function FefTableContent({
  state,
  meta,
  columns,
  serverPagination,
  columnVisibility,
  onColumnVisibilityChange,
  minRows,
  getRowInvalid,
}: {
  state: FefTableState;
  meta?: FefTableMeta;
  columns: ColumnDef<FefRow, string>[];
  serverPagination?: ServerPagination;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: React.Dispatch<React.SetStateAction<VisibilityState>>;
  /** Pads the table with blank visual rows so it always appears at least
   *  this many rows tall. Useful for keeping the Take Off table close to
   *  viewport height even when only a few real rows exist. */
  minRows?: number;
  /**
   * Optional per-row validator. Rows where this returns `true` are tinted
   * red with a "Invalid — Total Cost can't be computed" tooltip. Take Off
   * passes this; other sections leave it undefined and render unmarked.
   */
  getRowInvalid?: (row: FefRow) => boolean;
}) {
  const { data, setData, columnFilters, setColumnFilters } = state;
  const [localPageIndex, setLocalPageIndex] = React.useState(0);

  // Identity that flips when any non-row-data input that affects cell
  // rendering changes reference: query-derived meta arrays (e.g. an admin
  // added a Role and `roleOptions` was re-fetched) or `columnVisibility`
  // (the Show/Hide Details toggle adds/removes whole columns). Threading
  // this token through `FefTableRow`'s memo comparator makes every row
  // re-render exactly when the visible cell list or dropdown contents
  // could have changed, without re-rendering on keystrokes. Excludes
  // `selectedRowIndices` on purpose — selection changes already propagate
  // through each row's `selected` prop.
  const metaRev = React.useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      meta?.cbsOptions,
      meta?.weldGroupOptions,
      meta?.weldGroupMaterialMap,
      meta?.roleOptions,
      meta?.scheduleOptions,
      meta?.roleRates,
      meta?.crewMixOptions,
      meta?.taskCodeOptions,
      meta?.pipingFactorLookup,
      meta?.areaOptions,
      columnVisibility,
    ],
  );

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
      crewMixOptions: meta?.crewMixOptions ?? [],
      taskCodeOptions: meta?.taskCodeOptions ?? [],
      pipingFactorLookup: meta?.pipingFactorLookup,
      areaOptions: meta?.areaOptions ?? [],
      selectedRowIndices: meta?.selectedRowIndices,
      onToggleRowSelected: meta?.onToggleRowSelected,
      updateData: (rowIndex: number, columnId: string, value: string) => {
        debug("updateData", { rowIndex, columnId, value });
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, [columnId]: value } : row,
          ),
        );
      },
      updateRow: (rowIndex: number, updates: Record<string, string>) => {
        debug("updateRow", { rowIndex, updates });
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, ...updates } : row,
          ),
        );
      },
      deleteRow:
        meta?.deleteRow ??
        ((rowIndex: number) => {
          setData((old) => old.filter((_, index) => index !== rowIndex));
        }),
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
                  className="border border-gray-300 px-2 py-2 text-left font-semibold align-bottom"
                >
                  <div className="flex flex-col gap-1">
                    <span className="leading-tight">
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
            <FefTableRow
              key={row.id}
              row={row}
              rowIndex={i}
              selected={meta?.selectedRowIndices?.has(i) ?? false}
              metaRev={metaRev}
              getRowInvalid={getRowInvalid}
            />
          ))}
          {minRows !== undefined &&
            Array.from(
              {
                length: Math.max(
                  0,
                  minRows - table.getRowModel().rows.length,
                ),
              },
              (_, i) => {
                const overallIdx = table.getRowModel().rows.length + i;
                const visibleColumns = table.getVisibleLeafColumns();
                return (
                  <tr
                    key={`__filler-${i}`}
                    aria-hidden="true"
                    className={
                      overallIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }
                  >
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        style={{ minWidth: col.getSize() }}
                        className="border border-gray-300 px-3 py-2"
                      >
                        &nbsp;
                      </td>
                    ))}
                  </tr>
                );
              },
            )}
        </tbody>
      </table>
      <TablePagination
        table={table}
        totalCount={serverPagination?.totalCount}
      />
    </div>
  );
}

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
import type { CbsOption, FefRow } from "~/lib/types";
import {
  getMaterialsSectionRows,
  setMaterialsSectionRows,
} from "./materialsStore";
import { createDebug } from "./logger";
import {
  normalizeRange,
  rangeSpansMultiple,
  serializeRange,
  parseClipboardMatrix,
  applyPaste,
  applyClear,
  applyFillDown,
  selectionStats,
  insertRows,
  deleteRows,
  findMatches,
  replaceInCell,
  replaceAll,
  sortRows,
  type RangeSelection,
  type WriteCtx,
} from "./grid-range";
// Cell editors, CellSelect, ColumnFilter/pagination, and their helpers live in
// `fef-cells`; re-exported here so existing `~/lib/table-utils` imports still
// resolve (this module is the public entry point for the FEF table).
import {
  ColumnFilter,
  TablePagination,
  makeBlankRow,
  TAKE_OFF_INITIAL_ROWS,
} from "./fef-cells";
export * from "./fef-cells";

const debug = createDebug("fef");


// ── Shared FEF table state + content ────────────────────────────────────────

type RoleRate = { roleName: string; schedule: string; rate: number };

export type TaskCodeOption = { code: string; taskDefinition: string };
export type AreaSelectOption = { value: string; label: string };
export type CrewMixOption = {
  id: number;
  name: string;
  schedule: string;
  members: { roleName: string; count: number }[];
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
/** Callbacks the range-editing rows use to report pointer/focus and start a
 *  fill-handle drag. All are stable (useCallback) so they don't defeat the
 *  row memo. */
type RangeRowHandlers = {
  onCellPointerDown: (
    rowIndex: number,
    colIndex: number,
    e: React.MouseEvent,
  ) => void;
  onCellFocus: (rowIndex: number, colIndex: number) => void;
  onFillHandleDown: (e: React.MouseEvent) => void;
  onCellContextMenu: (
    rowIndex: number,
    colIndex: number,
    e: React.MouseEvent,
  ) => void;
  onRowHeaderClick: (rowIndex: number) => void;
};

/** Sticky-left placement for a frozen (pinned) column. */
type FrozenColumn = { left: number; width: number };
const GUTTER_WIDTH = 44;

const FefTableRow = React.memo(
  function FefTableRow({
    row,
    rowIndex,
    selected: _selected,
    metaRev: _metaRev,
    getRowInvalid,
    selMin,
    selMax,
    selBottom,
    rangeHandlers,
    frozen,
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
    /** Inclusive visible-column range selected on THIS row, or -1/-1 when the
     *  row is outside the current range selection. Primitives so the memo
     *  comparator skips rows whose selection didn't change. */
    selMin: number;
    selMax: number;
    /** True when this is the bottom row of the selection (renders the fill
     *  handle on its right-most selected cell). */
    selBottom: boolean;
    /** Present only when range editing is enabled on this table. */
    rangeHandlers?: RangeRowHandlers;
    /** Sticky-left offset+width per visible column (null = not frozen). Stable
     *  ref (memoized) so it doesn't defeat the row memo. */
    frozen?: (FrozenColumn | null)[];
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
        <td
          aria-hidden="true"
          onClick={
            rangeHandlers
              ? () => rangeHandlers.onRowHeaderClick(row.index)
              : undefined
          }
          title={rangeHandlers ? "Select row" : undefined}
          style={{ width: 44, minWidth: 44 }}
          className={`sticky left-0 z-10 select-none border border-gray-300 bg-gray-100 px-1 text-center text-xs text-gray-500${
            rangeHandlers ? " cursor-pointer hover:bg-gray-200" : ""
          }`}
        >
          {row.index + 1}
        </td>
        {row.getVisibleCells().map((cell, colIndex) => {
          const inSel = selMin >= 0 && colIndex >= selMin && colIndex <= selMax;
          const isFillCorner = selBottom && colIndex === selMax;
          const fz = frozen?.[colIndex] ?? null;
          return (
            <td
              key={cell.id}
              data-row={row.index}
              data-col={colIndex}
              style={
                fz
                  ? {
                      position: "sticky",
                      left: fz.left,
                      width: fz.width,
                      minWidth: fz.width,
                      zIndex: 10,
                    }
                  : { minWidth: cell.column.getSize() }
              }
              className={`relative border border-gray-300${
                fz ? ` ${baseBg}` : ""
              }${
                inSel ? " outline outline-1 -outline-offset-1 outline-blue-500" : ""
              }`}
              onMouseDown={
                rangeHandlers
                  ? (e) => rangeHandlers.onCellPointerDown(row.index, colIndex, e)
                  : undefined
              }
              onFocusCapture={
                rangeHandlers
                  ? () => rangeHandlers.onCellFocus(row.index, colIndex)
                  : undefined
              }
              onContextMenu={
                rangeHandlers
                  ? (e) => rangeHandlers.onCellContextMenu(row.index, colIndex, e)
                  : undefined
              }
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
              {inSel && (
                // Translucent wash above the cell's own input so the selection
                // reads over the white editors; pointer-events-none keeps
                // typing/clicking working through it.
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[1] bg-blue-400/15"
                />
              )}
              {isFillCorner && rangeHandlers && (
                <span
                  aria-hidden="true"
                  title="Drag to fill down"
                  onMouseDown={rangeHandlers.onFillHandleDown}
                  className="absolute -bottom-[3px] -right-[3px] z-[2] h-2 w-2 cursor-crosshair border border-white bg-blue-600"
                />
              )}
            </td>
          );
        })}
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
    // options without disturbing the editing-speed memoization. The sel*
    // primitives re-render only the rows whose range-selection changed;
    // `rangeHandlers` is a stable object.
    prev.row.original === next.row.original &&
    prev.rowIndex === next.rowIndex &&
    prev.selected === next.selected &&
    prev.metaRev === next.metaRev &&
    prev.getRowInvalid === next.getRowInvalid &&
    prev.selMin === next.selMin &&
    prev.selMax === next.selMax &&
    prev.selBottom === next.selBottom &&
    prev.rangeHandlers === next.rangeHandlers &&
    prev.frozen === next.frozen,
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

/** A labeled band of columns for the two-row grouped header. `columnIds` are
 *  matched against leaf column ids; grouped columns must be contiguous in the
 *  column order and must not straddle the frozen-column boundary.
 *  `defaultCollapsed` opens the sheet with the group hidden. `banner: false`
 *  makes it a show/hide *toggle only* (a chip, no header band) — for logical
 *  groups whose columns aren't contiguous, like the computed Labor & Cost set. */
export type ColumnGroup = {
  label: string;
  columnIds: string[];
  defaultCollapsed?: boolean;
  banner?: boolean;
};

/** The computed labor/cost output columns — ID, Sub, Unit, Labor Factor/Hours/
 *  Rate, Total Cost. A non-contiguous logical group shown as a single toggle
 *  chip (was the standalone "Show Details" button). Hidden by default so the
 *  take-off opens as a lean input view. Columns absent on a given sheet are
 *  simply ignored by the visibility toggle. */
export const LABOR_COST_GROUP: ColumnGroup = {
  label: "Labor & Cost",
  banner: false,
  defaultCollapsed: true,
  columnIds: [
    "id",
    "sub",
    "unit",
    "laborFactor",
    "laborHours",
    "laborRate",
    "totalCost",
  ],
};

/** Height (px) of the grouped-header banner row; the column-header row sticks
 *  directly below it. */
const BANNER_HEIGHT = 28;

export function FefTableContent({
  state,
  meta,
  columns,
  columnGroups,
  onToggleGroup,
  serverPagination,
  columnVisibility,
  onColumnVisibilityChange,
  minRows,
  getRowInvalid,
  enableRangeEditing,
  frozenColumnCount = 0,
}: {
  state: FefTableState;
  meta?: FefTableMeta;
  columns: ColumnDef<FefRow, string>[];
  /** When set, renders an Excel-style banner row of group labels above the
   *  column headers. Omit for a plain single-row header. */
  columnGroups?: ColumnGroup[];
  /** Clicking a group banner calls this with the group label — used to collapse
   *  the group (owner hides its columns). Omit to make banners non-interactive. */
  onToggleGroup?: (label: string) => void;
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
  /**
   * Enables Excel-style range editing on the grid: Shift+Click / Shift+Arrow
   * to select a rectangle, Ctrl+C / Ctrl+V to copy-paste (including to and
   * from Excel), Ctrl+D and the corner fill handle to fill down, and Delete
   * to clear. Only the Take Off sheet opts in.
   */
  enableRangeEditing?: boolean;
  /** Number of leading visible columns to freeze (pin) horizontally, in
   *  addition to the always-frozen row-number gutter. 0 = none. */
  frozenColumnCount?: number;
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

  // Map each dropdown's source options to `{ value, label }` ONCE for the whole
  // grid (memoized on the source array), then share via table meta — so a page
  // of ~25 dropdown cells doesn't each re-map the (large) CBS catalog on mount.
  const cbsSelectOptions = React.useMemo(
    () =>
      (meta?.cbsOptions ?? []).map((o) => ({
        value: o.displayCode,
        label: o.displayDescription ?? `${o.displayCode}: ${o.name}`,
      })),
    [meta?.cbsOptions],
  );
  const roleSelectOptions = React.useMemo(
    () => (meta?.roleOptions ?? []).map((o) => ({ value: o, label: o })),
    [meta?.roleOptions],
  );
  const scheduleSelectOptions = React.useMemo(
    () => (meta?.scheduleOptions ?? []).map((o) => ({ value: o, label: o })),
    [meta?.scheduleOptions],
  );
  const crewMixSelectOptions = React.useMemo(
    () =>
      (meta?.crewMixOptions ?? []).map((o) => ({
        value: String(o.id),
        label: o.name,
      })),
    [meta?.crewMixOptions],
  );

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
      cbsSelectOptions,
      roleSelectOptions,
      scheduleSelectOptions,
      crewMixSelectOptions,
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

  const {
    rows, frozen, rangeSel, rangeHandlers, onGridKeyDown, onGridPaste, stats,
    fmtStat, menu, menuCopy, menuCut, menuPaste, menuClear, menuInsert,
    menuDeleteRows, selectedRowCount, find, setFind, findIndex, setFindIndex,
    matches, goToMatch, doReplaceOne, doReplaceAll, sortState, onColSort,
    onColHeaderClick, onSelectAll,
  } = useGridRangeEditing({
    enableRangeEditing: !!enableRangeEditing,
    data,
    setData,
    table,
    meta,
    serverPagination,
    setLocalPageIndex,
    frozenColumnCount,
  });

  // Grouped-header banner segments, computed from the *visible* leaf columns so
  // hidden columns collapse and empty groups disappear. Consecutive non-frozen
  // columns sharing a group label coalesce into one banner cell; frozen columns
  // stay 1:1 with the leaf header so each keeps its own sticky-left offset.
  const bannerSegments = (() => {
    if (!columnGroups || columnGroups.length === 0) return null;
    const groupOf = new Map<string, string>();
    for (const g of columnGroups) {
      if (g.banner === false) continue; // chip-only groups don't get a band
      for (const id of g.columnIds) groupOf.set(id, g.label);
    }
    if (groupOf.size === 0) return null; // no banner groups → no banner row
    const leaf = table.getVisibleLeafColumns();
    const segs: {
      label: string;
      startIndex: number;
      span: number;
      frozen: boolean;
    }[] = [];
    for (let i = 0; i < leaf.length; i++) {
      const label = groupOf.get(leaf[i].id) ?? "";
      const isFrozen = i < frozenColumnCount;
      const last = segs[segs.length - 1];
      if (!isFrozen && last && !last.frozen && last.label === label) {
        last.span += 1;
      } else {
        segs.push({ label, startIndex: i, span: 1, frozen: isFrozen });
      }
    }
    return segs;
  })();
  const headerTop = bannerSegments ? BANNER_HEIGHT : 0;

  return (
    <div>
      {find && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
          <input
            autoFocus
            value={find.query}
            onChange={(e) => {
              setFind({ ...find, query: e.target.value });
              setFindIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goToMatch(e.shiftKey ? findIndex - 1 : findIndex + 1);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setFind(null);
              }
            }}
            placeholder="Find in sheet…"
            className="w-40 rounded border border-slate-300 px-2 py-1 focus:border-blue-400 focus:outline-none"
          />
          <span className="text-slate-500">
            {find.query === ""
              ? ""
              : matches.length === 0
                ? "No matches"
                : `${Math.min(findIndex + 1, matches.length)} of ${matches.length}`}
          </span>
          <button
            type="button"
            onClick={() => goToMatch(findIndex - 1)}
            aria-label="Previous match"
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => goToMatch(findIndex + 1)}
            aria-label="Next match"
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          >
            ↓
          </button>
          {find.mode === "replace" && (
            <>
              <input
                value={find.replace}
                onChange={(e) => setFind({ ...find, replace: e.target.value })}
                placeholder="Replace with…"
                className="w-40 rounded border border-slate-300 px-2 py-1 focus:border-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={doReplaceOne}
                disabled={matches.length === 0}
                className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={doReplaceAll}
                disabled={matches.length === 0}
                className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50"
              >
                Replace all
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setFind(null)}
            aria-label="Close find"
            className="ml-auto rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
      )}
    <div
      className="overflow-x-auto"
      onKeyDownCapture={enableRangeEditing ? onGridKeyDown : undefined}
      onPaste={enableRangeEditing ? onGridPaste : undefined}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          {bannerSegments && (
            <tr className="bg-gray-200">
              <th
                style={{
                  width: 44,
                  minWidth: 44,
                  height: BANNER_HEIGHT,
                  top: 0,
                }}
                className="sticky left-0 z-30 bg-gray-200 border border-gray-300"
              />
              {bannerSegments.map((seg) => {
                const fz = seg.frozen ? (frozen?.[seg.startIndex] ?? null) : null;
                const clickable = !!seg.label && !!onToggleGroup;
                return (
                  <th
                    key={seg.startIndex}
                    colSpan={seg.span}
                    onClick={
                      clickable ? () => onToggleGroup(seg.label) : undefined
                    }
                    title={clickable ? `Collapse ${seg.label}` : undefined}
                    style={
                      fz
                        ? {
                            position: "sticky",
                            top: 0,
                            left: fz.left,
                            width: fz.width,
                            minWidth: fz.width,
                            height: BANNER_HEIGHT,
                            zIndex: 30,
                          }
                        : { top: 0, height: BANNER_HEIGHT }
                    }
                    className={`sticky z-20 bg-gray-200 border border-gray-300 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600${
                      clickable ? " cursor-pointer hover:bg-gray-300" : ""
                    }`}
                  >
                    {seg.label}
                    {clickable && <span className="ml-1 text-slate-400">▾</span>}
                  </th>
                );
              })}
            </tr>
          )}
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-gray-100">
              <th
                onClick={enableRangeEditing ? onSelectAll : undefined}
                title={enableRangeEditing ? "Select all" : undefined}
                style={{ width: 44, minWidth: 44, top: headerTop }}
                className={`sticky left-0 z-30 select-none bg-gray-100 border border-gray-300 px-1 align-bottom${
                  enableRangeEditing ? " cursor-pointer" : ""
                }`}
              />
              {headerGroup.headers.map((header, colIndex) => {
                const fz = frozen?.[colIndex] ?? null;
                return (
                <th
                  key={header.id}
                  style={
                    fz
                      ? {
                          position: "sticky",
                          top: headerTop,
                          left: fz.left,
                          width: fz.width,
                          minWidth: fz.width,
                          zIndex: 30,
                        }
                      : { top: headerTop, minWidth: header.column.getSize() }
                  }
                  className="sticky z-20 bg-gray-100 border border-gray-300 px-2 py-2 text-left font-semibold align-bottom"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 leading-tight">
                      <span
                        className={
                          enableRangeEditing
                            ? "cursor-pointer hover:text-blue-700"
                            : undefined
                        }
                        onClick={
                          enableRangeEditing
                            ? () => onColHeaderClick(colIndex)
                            : undefined
                        }
                        title={enableRangeEditing ? "Select column" : undefined}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      {header.column.id !== "__select" &&
                        header.column.id !== "delete" && (
                          <button
                            type="button"
                            onClick={() => onColSort(header.column.id)}
                            title="Sort by this column"
                            className="ml-auto shrink-0 text-xs text-gray-400 hover:text-blue-700"
                          >
                            {sortState?.colId === header.column.id
                              ? sortState.dir === "asc"
                                ? "▲"
                                : "▼"
                              : "⇅"}
                          </button>
                        )}
                    </div>
                    <ColumnFilter column={header.column} data={data} />
                  </div>
                </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const inRange =
              rangeSel != null &&
              row.index >= rangeSel.minRow &&
              row.index <= rangeSel.maxRow;
            return (
              <FefTableRow
                key={row.id}
                row={row}
                rowIndex={i}
                selected={meta?.selectedRowIndices?.has(i) ?? false}
                metaRev={metaRev}
                getRowInvalid={getRowInvalid}
                selMin={inRange ? rangeSel!.minCol : -1}
                selMax={inRange ? rangeSel!.maxCol : -1}
                selBottom={inRange && row.index === rangeSel!.maxRow}
                rangeHandlers={enableRangeEditing ? rangeHandlers : undefined}
                frozen={frozen}
              />
            );
          })}
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
                    <td
                      style={{ width: 44, minWidth: 44 }}
                      className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-1 text-center text-xs text-gray-400"
                    >
                      {overallIdx + 1}
                    </td>
                    {visibleColumns.map((col, colIndex) => {
                      const fz = frozen?.[colIndex] ?? null;
                      return (
                        <td
                          key={col.id}
                          style={
                            fz
                              ? {
                                  position: "sticky",
                                  left: fz.left,
                                  width: fz.width,
                                  minWidth: fz.width,
                                  zIndex: 10,
                                }
                              : { minWidth: col.getSize() }
                          }
                          className={`border border-gray-300 px-3 py-2${
                            fz
                              ? overallIdx % 2 === 0
                                ? " bg-white"
                                : " bg-gray-50"
                              : ""
                          }`}
                        >
                          &nbsp;
                        </td>
                      );
                    })}
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
      {stats && stats.count > 0 && (
        <div className="mt-1 flex flex-wrap justify-end gap-4 px-2 text-xs text-slate-600">
          {stats.numericCount > 0 && (
            <>
              <span>
                Sum:{" "}
                <span className="font-semibold text-slate-800">
                  {fmtStat(stats.sum)}
                </span>
              </span>
              <span>
                Average:{" "}
                <span className="font-semibold text-slate-800">
                  {fmtStat(stats.average)}
                </span>
              </span>
            </>
          )}
          <span>
            Count:{" "}
            <span className="font-semibold text-slate-800">{stats.count}</span>
          </span>
        </div>
      )}
      {menu && (
        <div
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-40 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {(
            [
              ["Cut", menuCut],
              ["Copy", menuCopy],
              ["Paste", menuPaste],
              ["divider", null],
              [`Insert ${selectedRowCount} row${selectedRowCount === 1 ? "" : "s"} above`, () => menuInsert("above")],
              [`Insert ${selectedRowCount} row${selectedRowCount === 1 ? "" : "s"} below`, () => menuInsert("below")],
              [`Delete ${selectedRowCount} row${selectedRowCount === 1 ? "" : "s"}`, menuDeleteRows],
              ["divider", null],
              ["Clear contents", menuClear],
            ] as [string, (() => void) | null][]
          ).map(([label, action], i) =>
            action === null ? (
              <div key={`d${i}`} className="my-1 border-t border-slate-100" />
            ) : (
              <button
                key={label}
                type="button"
                onClick={action}
                className="block w-full px-3 py-1 text-left text-slate-700 hover:bg-slate-100"
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * All Excel-style range-editing state and behavior for the FEF grid: cell
 * selection, keyboard shortcuts, the fill-handle drag, the selection status
 * bar, the right-click context menu, find & replace, click-header sort, and
 * frozen-column offsets. Extracted from FefTableContent so the component is
 * just table setup + this hook + render. Runs unconditionally; behavior is
 * gated on `enableRangeEditing`.
 */
function useGridRangeEditing({
  enableRangeEditing,
  data,
  setData,
  table,
  meta,
  serverPagination,
  setLocalPageIndex,
  frozenColumnCount,
}: {
  enableRangeEditing: boolean;
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  table: ReturnType<typeof useReactTable<FefRow>>;
  meta?: FefTableMeta;
  serverPagination?: ServerPagination;
  setLocalPageIndex: React.Dispatch<React.SetStateAction<number>>;
  frozenColumnCount: number;
}) {
  // ── Excel-style range editing (opt-in via enableRangeEditing) ─────────────
  // All hooks below run unconditionally (rules of hooks); their behavior is
  // gated on `enableRangeEditing` so non-Take-Off sheets are unaffected.
  const rows = table.getRowModel().rows;
  const columnIds = table.getVisibleLeafColumns().map((c) => c.id);
  const colCount = columnIds.length;
  const firstRowIndex = rows.length > 0 ? rows[0].index : 0;
  const lastRowIndex = rows.length > 0 ? rows[rows.length - 1].index : 0;

  // Sticky-left offsets for the frozen leading columns. Keyed on the visible
  // column set + count so the array reference is stable across edit renders
  // (keeping the row memo effective) but recomputes when columns show/hide.
  const frozenKey = `${frozenColumnCount}|${columnIds.join(",")}`;
  const frozen = React.useMemo(() => {
    if (frozenColumnCount <= 0) return undefined;
    const cols = table.getVisibleLeafColumns();
    const out: (FrozenColumn | null)[] = [];
    let left = GUTTER_WIDTH;
    for (let i = 0; i < cols.length; i++) {
      if (i < frozenColumnCount) {
        const width = cols[i].getSize();
        out.push({ left, width });
        left += width;
      } else {
        out.push(null);
      }
    }
    return out;
    // `table`/`cols` are read fresh at recompute; `frozenKey` captures the
    // inputs that actually change the offsets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenKey]);

  const [selection, setSelection] = React.useState<RangeSelection | null>(null);
  const [filling, setFilling] = React.useState(false);
  const pasteIdRef = React.useRef(1_000_000);
  const [find, setFind] = React.useState<{
    query: string;
    replace: string;
    mode: "find" | "replace";
  } | null>(null);
  const [findIndex, setFindIndex] = React.useState(0);
  const [sortState, setSortState] = React.useState<{
    colId: string;
    dir: "asc" | "desc";
  } | null>(null);

  const writeCtx = React.useMemo<WriteCtx>(
    () => ({
      roleOptions: meta?.roleOptions ?? [],
      scheduleOptions: meta?.scheduleOptions ?? [],
      roleRates: meta?.roleRates ?? [],
      areaOptions: meta?.areaOptions ?? [],
      cbsOptions: meta?.cbsOptions ?? [],
      crewMixOptions: meta?.crewMixOptions ?? [],
    }),
    [
      meta?.roleOptions,
      meta?.scheduleOptions,
      meta?.roleRates,
      meta?.areaOptions,
      meta?.cbsOptions,
      meta?.crewMixOptions,
    ],
  );

  // Snapshot of everything a deferred (drag mouseup) handler needs, refreshed
  // after every render so those closures never read stale state.
  const latest = React.useRef({
    data,
    columnIds,
    writeCtx,
    selection,
    firstRowIndex,
    lastRowIndex,
  });
  React.useEffect(() => {
    latest.current = {
      data,
      columnIds,
      writeCtx,
      selection,
      firstRowIndex,
      lastRowIndex,
    };
  });

  const onCellFocus = React.useCallback((rowIndex: number, colIndex: number) => {
    // Plain focus/click collapses the selection to the focused cell.
    setSelection({
      anchor: { row: rowIndex, col: colIndex },
      focus: { row: rowIndex, col: colIndex },
    });
  }, []);

  const onCellPointerDown = React.useCallback(
    (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
      // Shift+Click extends the range from the existing anchor without moving
      // DOM focus (so the anchor cell keeps its caret).
      if (!e.shiftKey) return;
      e.preventDefault();
      setSelection((prev) =>
        prev
          ? { ...prev, focus: { row: rowIndex, col: colIndex } }
          : {
              anchor: { row: rowIndex, col: colIndex },
              focus: { row: rowIndex, col: colIndex },
            },
      );
    },
    [],
  );

  const onFillHandleDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFilling(true);
  }, []);

  // Right-click context menu (cut / copy / paste / insert / delete / clear).
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const onCellContextMenu = React.useCallback(
    (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      // Keep a multi-cell selection if the click is inside it; otherwise
      // collapse to the right-clicked cell (Excel's behavior).
      setSelection((prev) => {
        if (prev) {
          const r = normalizeRange(prev);
          if (
            rowIndex >= r.minRow &&
            rowIndex <= r.maxRow &&
            colIndex >= r.minCol &&
            colIndex <= r.maxCol
          ) {
            return prev;
          }
        }
        return {
          anchor: { row: rowIndex, col: colIndex },
          focus: { row: rowIndex, col: colIndex },
        };
      });
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  // Excel-style header clicks: a row number selects its whole row, a column
  // header selects the whole column, and the top-left corner selects all.
  const onRowHeaderClick = React.useCallback((rowIndex: number) => {
    const cc = latest.current.columnIds.length;
    setSelection({
      anchor: { row: rowIndex, col: 0 },
      focus: { row: rowIndex, col: Math.max(0, cc - 1) },
    });
  }, []);
  const onColHeaderClick = React.useCallback((colIndex: number) => {
    const { firstRowIndex: fr, lastRowIndex: lr } = latest.current;
    setSelection({
      anchor: { row: fr, col: colIndex },
      focus: { row: lr, col: colIndex },
    });
  }, []);
  const onSelectAll = React.useCallback(() => {
    const { firstRowIndex: fr, lastRowIndex: lr, columnIds: cids } =
      latest.current;
    setSelection({
      anchor: { row: fr, col: 0 },
      focus: { row: lr, col: Math.max(0, cids.length - 1) },
    });
  }, []);

  const rangeHandlers = React.useMemo(
    () => ({
      onCellPointerDown,
      onCellFocus,
      onFillHandleDown,
      onCellContextMenu,
      onRowHeaderClick,
    }),
    [
      onCellPointerDown,
      onCellFocus,
      onFillHandleDown,
      onCellContextMenu,
      onRowHeaderClick,
    ],
  );

  // Dismiss the context menu on any outside interaction or Escape.
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Fill-handle drag: extend the selection downward to the row under the
  // cursor, then fill-down on release. Down-only (the common estimator case).
  React.useEffect(() => {
    if (!filling) return;
    const onMove = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const td = (el as Element | null)?.closest("td[data-row]");
      const attr = td?.getAttribute("data-row");
      if (attr == null) return;
      const r = parseInt(attr, 10);
      if (Number.isNaN(r)) return;
      setSelection((prev) => {
        if (!prev) return prev;
        const top = Math.min(prev.anchor.row, prev.focus.row);
        return { ...prev, focus: { row: Math.max(top, r), col: prev.focus.col } };
      });
    };
    const onUp = () => {
      setFilling(false);
      const { data: d, columnIds: cids, writeCtx: c, selection: sel } =
        latest.current;
      if (sel && rangeSpansMultiple(sel)) {
        setData(applyFillDown(d, cids, sel, c));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [filling, setData]);

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (!enableRangeEditing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    // Ctrl/Cmd+F (find) and Ctrl/Cmd+H (replace) open the sheet's find bar.
    if (mod && (key === "f" || key === "F")) {
      e.preventDefault();
      e.stopPropagation();
      setFind((prev) =>
        prev
          ? { ...prev, mode: "find" }
          : { query: "", replace: "", mode: "find" },
      );
      return;
    }
    if (mod && (key === "h" || key === "H")) {
      e.preventDefault();
      e.stopPropagation();
      setFind((prev) =>
        prev
          ? { ...prev, mode: "replace" }
          : { query: "", replace: "", mode: "replace" },
      );
      return;
    }

    if (!selection) return;

    if (!mod && e.shiftKey && key.startsWith("Arrow")) {
      e.preventDefault();
      e.stopPropagation();
      setSelection((prev) => {
        if (!prev) return prev;
        let { row, col } = prev.focus;
        if (key === "ArrowUp") row = Math.max(firstRowIndex, row - 1);
        else if (key === "ArrowDown") row = Math.min(lastRowIndex, row + 1);
        else if (key === "ArrowLeft") col = Math.max(0, col - 1);
        else if (key === "ArrowRight") col = Math.min(colCount - 1, col + 1);
        return { ...prev, focus: { row, col } };
      });
      return;
    }

    // Ctrl/Cmd+Shift+Arrow — extend the selection to the far edge (Excel).
    if (mod && e.shiftKey && key.startsWith("Arrow")) {
      e.preventDefault();
      e.stopPropagation();
      setSelection((prev) => {
        if (!prev) return prev;
        let { row, col } = prev.focus;
        if (key === "ArrowUp") row = firstRowIndex;
        else if (key === "ArrowDown") row = lastRowIndex;
        else if (key === "ArrowLeft") col = 0;
        else if (key === "ArrowRight") col = colCount - 1;
        return { ...prev, focus: { row, col } };
      });
      return;
    }

    // Ctrl/Cmd+A — select the whole grid.
    if (mod && !e.shiftKey && (key === "a" || key === "A")) {
      e.preventDefault();
      e.stopPropagation();
      setSelection({
        anchor: { row: firstRowIndex, col: 0 },
        focus: { row: lastRowIndex, col: colCount - 1 },
      });
      return;
    }

    // Ctrl/Cmd+X — cut a multi-cell range (copy to clipboard, then clear).
    if (mod && (key === "x" || key === "X") && rangeSpansMultiple(selection)) {
      e.preventDefault();
      e.stopPropagation();
      void navigator.clipboard?.writeText(
        serializeRange(data, columnIds, selection, writeCtx),
      );
      setData(applyClear(data, columnIds, selection, writeCtx));
      return;
    }

    if (mod && (key === "c" || key === "C") && rangeSpansMultiple(selection)) {
      // Drive copy from keydown + the Clipboard API rather than a native `copy`
      // event: after Shift-selecting a range the focused cell <input> has a
      // collapsed caret, and browsers don't reliably fire `copy` with nothing
      // selected; dropdown cells (<select>) never fire it at all. keydown always
      // fires, for both. Single-cell copy still falls through to native.
      e.preventDefault();
      e.stopPropagation();
      void navigator.clipboard?.writeText(
        serializeRange(data, columnIds, selection, writeCtx),
      );
      return;
    }

    if (mod && (key === "v" || key === "V")) {
      // A focused text input can paste natively (see onGridPaste, which spills a
      // block even into a single input). For a multi-cell target or a non-input
      // cell (<select>), native paste can't do it — read the clipboard ourselves.
      const target = e.target as HTMLElement | null;
      const nativePasteWorks =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (!rangeSpansMultiple(selection) && nativePasteWorks) return;
      e.preventDefault();
      e.stopPropagation();
      const clip = navigator.clipboard;
      if (!clip?.readText) return;
      void clip
        .readText()
        .then((text) => {
          const { data: d, columnIds: cids, writeCtx: c, selection: sel } =
            latest.current;
          if (!sel) return;
          const matrix = parseClipboardMatrix(text);
          const isBlock = matrix.length > 1 || matrix.some((r) => r.length > 1);
          if (!isBlock && !rangeSpansMultiple(sel)) return;
          const { minRow, minCol } = normalizeRange(sel);
          setData(
            applyPaste(d, cids, { row: minRow, col: minCol }, matrix, c, () =>
              makeBlankRow(pasteIdRef.current++),
            ),
          );
        })
        .catch(() => {
          // Clipboard read denied/unsupported — nothing to paste.
        });
      return;
    }

    if (mod && (key === "d" || key === "D")) {
      e.preventDefault();
      e.stopPropagation();
      if (rangeSpansMultiple(selection)) {
        setData(applyFillDown(data, columnIds, selection, writeCtx));
      }
      return;
    }

    if ((key === "Delete" || key === "Backspace") && rangeSpansMultiple(selection)) {
      e.preventDefault();
      e.stopPropagation();
      setData(applyClear(data, columnIds, selection, writeCtx));
      return;
    }

    if (key === "Escape" && rangeSpansMultiple(selection)) {
      e.preventDefault();
      e.stopPropagation();
      setSelection((prev) => (prev ? { anchor: prev.focus, focus: prev.focus } : prev));
    }
  };

  const onGridPaste = (e: React.ClipboardEvent) => {
    if (!enableRangeEditing || !selection) return;
    const text = e.clipboardData.getData("text/plain");
    const matrix = parseClipboardMatrix(text);
    const isBlock = matrix.length > 1 || matrix.some((r) => r.length > 1);
    // A single value pasted into one cell is left to the input's native paste;
    // a block (or a multi-cell target) is spilled across the grid. Copy and
    // <select>-cell paste are handled in onGridKeyDown via the Clipboard API;
    // this native `paste` path still serves the common case of pasting a block
    // into a focused text input.
    if (!isBlock && !rangeSpansMultiple(selection)) return;
    e.preventDefault();
    const { minRow, minCol } = normalizeRange(selection);
    setData(
      applyPaste(
        data,
        columnIds,
        { row: minRow, col: minCol },
        matrix,
        writeCtx,
        () => makeBlankRow(pasteIdRef.current++),
      ),
    );
  };

  const rangeSel = enableRangeEditing && selection ? normalizeRange(selection) : null;

  // Stable value-key for `columnIds` (a fresh array each render) so the memos
  // below don't recompute on every render just because its reference changed.
  const colKey = columnIds.join(",");

  // Excel-style status bar for the current multi-cell selection. Memoized so
  // it only recomputes when the selection or data actually changes.
  const stats = React.useMemo(
    () =>
      enableRangeEditing && selection && rangeSpansMultiple(selection)
        ? selectionStats(data, columnIds, selection, writeCtx)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enableRangeEditing, selection, data, colKey, writeCtx],
  );
  const fmtStat = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  // Context-menu actions. They read the live selection through `latest` so the
  // async paste path isn't stale, and each closes the menu.
  const menuCopy = () => {
    if (selection) {
      void navigator.clipboard?.writeText(
        serializeRange(data, columnIds, selection, writeCtx),
      );
    }
    setMenu(null);
  };
  const menuCut = () => {
    if (selection) {
      void navigator.clipboard?.writeText(
        serializeRange(data, columnIds, selection, writeCtx),
      );
      setData(applyClear(data, columnIds, selection, writeCtx));
    }
    setMenu(null);
  };
  const menuPaste = () => {
    const clip = navigator.clipboard;
    if (selection && clip?.readText) {
      void clip
        .readText()
        .then((text) => {
          const { data: d, columnIds: cids, writeCtx: c, selection: sel } =
            latest.current;
          if (!sel) return;
          const { minRow, minCol } = normalizeRange(sel);
          setData(
            applyPaste(
              d,
              cids,
              { row: minRow, col: minCol },
              parseClipboardMatrix(text),
              c,
              () => makeBlankRow(pasteIdRef.current++),
            ),
          );
        })
        .catch(() => {});
    }
    setMenu(null);
  };
  const menuClear = () => {
    if (selection) setData(applyClear(data, columnIds, selection, writeCtx));
    setMenu(null);
  };
  const menuInsert = (where: "above" | "below") => {
    if (selection) {
      const { minRow, maxRow } = normalizeRange(selection);
      const count = maxRow - minRow + 1;
      const at = where === "above" ? minRow : maxRow + 1;
      setData(
        insertRows(data, at, count, () => makeBlankRow(pasteIdRef.current++)),
      );
    }
    setMenu(null);
  };
  const menuDeleteRows = () => {
    if (selection) {
      const { minRow, maxRow } = normalizeRange(selection);
      setData(deleteRows(data, minRow, maxRow));
      setSelection((prev) =>
        prev ? { anchor: prev.anchor, focus: prev.anchor } : prev,
      );
    }
    setMenu(null);
  };
  const selectedRowCount = selection
    ? normalizeRange(selection).maxRow - normalizeRange(selection).minRow + 1
    : 0;

  // Find & replace over the sheet's cells. Memoized (find scans every cell) so
  // an unrelated re-render while the find bar is open doesn't rescan the sheet.
  const matches = React.useMemo(
    () => (find ? findMatches(data, columnIds, find.query, writeCtx) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [find, data, colKey, writeCtx],
  );
  const goToMatch = (i: number) => {
    if (matches.length === 0) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    setFindIndex(idx);
    const m = matches[idx];
    setSelection({ anchor: m, focus: m });
    // Jump the (client-paginated) page so the match is visible.
    if (!serverPagination) setLocalPageIndex(Math.floor(m.row / 25));
  };
  const doReplaceOne = () => {
    if (!find || matches.length === 0) return;
    const m = matches[Math.min(findIndex, matches.length - 1)];
    setData(replaceInCell(data, columnIds, m, find.query, find.replace, writeCtx));
  };
  const doReplaceAll = () => {
    if (!find) return;
    setData(replaceAll(data, columnIds, find.query, find.replace, writeCtx).data);
  };

  // Click-header sort. Physically reorders the rows (persisted, undoable) so the
  // index-based selection/fill stay correct; toggles asc → desc on repeat.
  const onColSort = (colId: string) => {
    const dir: "asc" | "desc" =
      sortState?.colId === colId && sortState.dir === "asc" ? "desc" : "asc";
    setSortState({ colId, dir });
    setData(sortRows(data, colId, dir, writeCtx));
  };

  return {
    rows, frozen, rangeSel, rangeHandlers, onGridKeyDown, onGridPaste, stats,
    fmtStat, menu, menuCopy, menuCut, menuPaste, menuClear, menuInsert,
    menuDeleteRows, selectedRowCount, find, setFind, findIndex, setFindIndex,
    matches, goToMatch, doReplaceOne, doReplaceAll, sortState, onColSort,
    onColHeaderClick, onSelectAll,
  };
}

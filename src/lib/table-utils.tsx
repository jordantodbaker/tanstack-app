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
// Cell editors, CellSelect, ColumnFilter/pagination, and their helpers live in
// `fef-cells`; re-exported here so existing `~/lib/table-utils` imports still
// resolve (this module is the public entry point for the FEF table).
import {
  ColumnFilter,
  TablePagination,
  TAKE_OFF_INITIAL_ROWS,
} from "./fef-cells";
export * from "./fef-cells";
// The shared type surface and the range-editing hook live in their own
// modules; both are re-exported here so `~/lib/table-utils` stays the public
// entry point for the FEF table and existing imports keep resolving.
import type {
  ColumnGroup,
  FefTableMeta,
  FefTableState,
  FrozenColumn,
  RangeRowHandlers,
  ServerPagination,
} from "./fef-table-types";
export * from "./fef-table-types";
import { useGridRangeEditing } from "./use-grid-range-editing";
import { useViewportFillHeight } from "./use-viewport-fill-height";
export { useGridRangeEditing } from "./use-grid-range-editing";

const debug = createDebug("fef");


// ── Shared FEF table state + content ────────────────────────────────────────

/** Resize bounds, in px. */
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 800;

const WIDTH_STORAGE_PREFIX = "fef-col-widths:";

/** Saved column widths for a sheet, or {} when there are none / storage is
 *  unavailable (SSR, privacy mode). Never throws — a bad blob just means
 *  default widths. Values are re-clamped on read so a stored width can't
 *  outlive a change to the bounds. */
function readStoredWidths(key: string | undefined): Record<string, number> {
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WIDTH_STORAGE_PREFIX + key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[k] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, v));
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredWidths(
  key: string | undefined,
  widths: Record<string, number>,
): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WIDTH_STORAGE_PREFIX + key,
      JSON.stringify(widths),
    );
  } catch {
    // Storage full or blocked — the widths just won't survive a reload.
  }
}

/** The width-persistence internals, exposed for tests. Not part of the
 *  component API — the grid reads and writes these itself. */
export const __columnWidthStorage = {
  read: readStoredWidths,
  write: writeStoredWidths,
  MIN: MIN_COL_WIDTH,
  MAX: MAX_COL_WIDTH,
  PREFIX: WIDTH_STORAGE_PREFIX,
};

/**
 * Column-width state for one sheet, persisted to localStorage under
 * `columnWidthKey`. Seeded from storage in the lazy initializer so the first
 * paint is already at the user's widths (hydrating in an effect would re-layout
 * a frame in). Returns the sizing map, the TanStack `onColumnSizingChange`
 * handler (writes through to storage), a per-column reset back to the column-def
 * size, and whether resizing is enabled at all (off when no key is given).
 */
function useColumnWidths(columnWidthKey: string | undefined) {
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>(
    () => readStoredWidths(columnWidthKey),
  );
  const resizable = columnWidthKey !== undefined;
  const handleColumnSizingChange = React.useCallback(
    (updater: React.SetStateAction<Record<string, number>>) => {
      setColumnSizing((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        writeStoredWidths(columnWidthKey, next);
        return next;
      });
    },
    [columnWidthKey],
  );
  /** Drop a column's stored width so it falls back to its column-def size. */
  const resetColumnWidth = React.useCallback(
    (columnId: string) => {
      handleColumnSizingChange((prev) => {
        if (!(columnId in prev)) return prev;
        const next = { ...prev };
        delete next[columnId];
        return next;
      });
    },
    [handleColumnSizingChange],
  );
  return { columnSizing, handleColumnSizingChange, resetColumnWidth, resizable };
}

/**
 * Sticky-left CSS for a frozen (pinned leading) data cell, or the default
 * min-width style for a non-frozen one. Shared by the memoized data rows and
 * the filler rows so their frozen offsets can never drift apart.
 */
function cellFreezeStyle(
  fz: FrozenColumn | null,
  fallbackWidth: number,
): React.CSSProperties {
  return fz
    ? {
        position: "sticky",
        left: fz.left,
        width: fz.width,
        minWidth: fz.width,
        zIndex: 10,
      }
    : { minWidth: fallbackWidth };
}

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
              style={cellFreezeStyle(fz, cell.column.getSize())}
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

/** The computed labor/cost output columns — ID, Sub, Unit, Labor Factor/Hours/
 *  Rate, Total Cost. A non-contiguous logical group shown as a single toggle
 *  chip (was the standalone "Show Details" button). Hidden by default so the
 *  take-off opens as a lean input view. Columns absent on a given sheet are
 *  simply ignored by the visibility toggle. */
export const LABOR_COST_GROUP: ColumnGroup = {
  label: "Labor & Cost",
  banner: false,
  defaultCollapsed: true,
  // "id" is deliberately NOT here. It used to be, which meant the CBS code was
  // hidden by default along with the computed columns — tolerable only while
  // the Name cell rendered "code: name" and carried the code itself. Now that
  // Name shows just the name, the code has to be a column of its own, always
  // visible and frozen beside it.
  columnIds: [
    "sub",
    "unit",
    "laborFactor",
    "laborHours",
    "unitHours",
    "laborRate",
    "totalCost",
    "unitRate",
  ],
};

/** Height (px) of the grouped-header banner row; the column-header row sticks
 *  directly below it. */
const BANNER_HEIGHT = 28;

type FindState = { query: string; replace: string; mode: "find" | "replace" };

/**
 * The Excel-style Find / Find-&-Replace bar shown above the grid when a find
 * session is open. Pure presentational — the session state lives in the
 * range-editing hook and is threaded in; `matchCount` is `matches.length`.
 */
function GridFindBar({
  find,
  setFind,
  findIndex,
  setFindIndex,
  matchCount,
  goToMatch,
  doReplaceOne,
  doReplaceAll,
}: {
  find: FindState;
  setFind: React.Dispatch<React.SetStateAction<FindState | null>>;
  findIndex: number;
  setFindIndex: React.Dispatch<React.SetStateAction<number>>;
  matchCount: number;
  goToMatch: (i: number) => void;
  doReplaceOne: () => void;
  doReplaceAll: () => void;
}) {
  return (
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
          : matchCount === 0
            ? "No matches"
            : `${Math.min(findIndex + 1, matchCount)} of ${matchCount}`}
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
            disabled={matchCount === 0}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={doReplaceAll}
            disabled={matchCount === 0}
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
  );
}

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
  columnWidthKey,
  frozenColumnCount = 0,
  frozenThroughColumnId,
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
  /**
   * Enables drag-to-resize column edges and remembers the widths under this
   * key (localStorage, per sheet). Omit to keep fixed widths.
   */
  columnWidthKey?: string;
  /** Number of leading visible columns to freeze (pin) horizontally, in
   *  addition to the always-frozen row-number gutter. 0 = none. */
  frozenColumnCount?: number;
  /**
   * Freeze through this column instead of a fixed count — every visible
   * column up to and including it stays pinned.
   *
   * A count is positional, so it silently freezes something else whenever
   * column visibility changes: the take-off froze through Name only while ID
   * was hidden inside a collapsed group, and expanding that group pushed Name
   * out of the frozen set and off-screen. Naming the column makes the intent
   * ("keep the row identifiable") survive a visibility change.
   *
   * Falls back to `frozenColumnCount` when the column is not currently visible.
   */
  frozenThroughColumnId?: string;
}) {
  const { data, setData, columnFilters, setColumnFilters } = state;
  const [localPageIndex, setLocalPageIndex] = React.useState(0);

  // Any filter change re-cuts the pages under the reader, so page 4 of the
  // unfiltered sheet is usually past the end of the filtered one — an empty
  // grid that reads as "the filter matched nothing". Go back to the first
  // page of the new result set instead.
  React.useEffect(() => {
    setLocalPageIndex(0);
  }, [columnFilters]);

  const { columnSizing, handleColumnSizingChange, resetColumnWidth, resizable } =
    useColumnWidths(columnWidthKey);

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
      meta?.steelMemberOptions,
      meta?.steelMemberUomLookup,
      meta?.steelMemberTonsLookup,
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
        // Picking needs the code; reading the sheet does not — the ID column
        // carries it, frozen alongside Name.
        label: o.displayDescription ?? `${o.displayCode}: ${o.name}`,
        shortLabel: o.name || o.displayCode,
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
    // "onEnd" commits the new width once, on mouse-up. "onChange" would push a
    // width through React state on every mousemove, re-rendering every cell of
    // every row — thousands of them on the take-off — for each frame of a drag.
    // The handle itself previews the drag by translating, so it still tracks
    // the cursor.
    enableColumnResizing: resizable,
    columnResizeMode: "onEnd",
    defaultColumn: { minSize: MIN_COL_WIDTH, maxSize: MAX_COL_WIDTH },
    onColumnSizingChange: handleColumnSizingChange,
    state: { columnFilters, pagination, columnSizing, ...(columnVisibility !== undefined && { columnVisibility }) },
    meta: {
      // Pass every caller-supplied field through untouched — the option lists,
      // the steel/piping lookups, areaOptions, and the selection state all live
      // on `meta`. Cells default these locally (`?? []` / `?? {}` / `?.`), so no
      // per-field defaults are needed here: a new `FefTableMeta` field flows
      // through automatically without editing this literal.
      ...meta,
      // Option lists pre-mapped to `{ value, label }` once per grid (computed
      // just above) so a page of dropdown cells doesn't each re-map the source.
      cbsSelectOptions,
      roleSelectOptions,
      scheduleSelectOptions,
      crewMixSelectOptions,
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

  // Resolved against the CURRENT visible columns, so hiding or showing a
  // column ahead of the anchor moves the freeze boundary with it.
  const visibleLeafIds = table.getVisibleLeafColumns().map((c) => c.id);
  const frozenCount = React.useMemo(() => {
    if (!frozenThroughColumnId) return frozenColumnCount;
    const at = visibleLeafIds.indexOf(frozenThroughColumnId);
    return at === -1 ? frozenColumnCount : at + 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenThroughColumnId, frozenColumnCount, visibleLeafIds.join(",")]);

  const {
    gridRef,
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
    frozenColumnCount: frozenCount,
  });

  // Reserve room below the pane for the pager and the selection status line,
  // both of which sit outside it.
  const gridMaxHeight = useViewportFillHeight(gridRef, { reserve: 116 });

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
      const isFrozen = i < frozenCount;
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
        <GridFindBar
          find={find}
          setFind={setFind}
          findIndex={findIndex}
          setFindIndex={setFindIndex}
          matchCount={matches.length}
          goToMatch={goToMatch}
          doReplaceOne={doReplaceOne}
          doReplaceAll={doReplaceAll}
        />
      )}
    <div
      ref={gridRef}
      // Focusable but not a tab stop, so the header/gutter click and
      // fill-handle handlers can park focus here and keep the range shortcuts
      // (Ctrl+D fill down, Ctrl+C/V, Delete) inside the grid instead of
      // letting the browser take them.
      tabIndex={enableRangeEditing ? -1 : undefined}
      // Capped to the space between here and the bottom of the viewport, so
      // the horizontal scrollbar stays on screen instead of sitting below the
      // last row. The cap is also what gives the `sticky` header row (and the
      // frozen columns' `sticky left`) a container with room to scroll —
      // without it they had nothing to stick to. A sheet shorter than the cap
      // is unaffected: `max-height` only ever clips.
      style={{ maxHeight: gridMaxHeight }}
      className="overflow-auto focus:outline-none"
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
                      : {
                          top: headerTop,
                          minWidth: header.column.getSize(),
                          // A resizable column also pins `width`. `minWidth`
                          // alone only ever grows a column: with the table at
                          // w-full the browser hands out slack space, so
                          // dragging an edge left would change the number and
                          // nothing on screen.
                          ...(resizable && { width: header.column.getSize() }),
                        }
                  }
                  className="sticky z-20 bg-gray-100 border border-gray-300 px-2 py-2 text-left font-semibold align-bottom"
                >
                  {resizable && header.column.getCanResize() && (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${header.column.id}`}
                      title="Drag to resize · double-click to reset"
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onDoubleClick={() => resetColumnWidth(header.column.id)}
                      // Keep the drag off the header's own click handlers —
                      // the column-select span sits right beside it.
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        transform: header.column.getIsResizing()
                          ? `translateX(${
                              table.getState().columnSizingInfo.deltaOffset ?? 0
                            }px)`
                          : undefined,
                      }}
                      className={`absolute right-0 top-0 z-40 h-full w-1.5 cursor-col-resize touch-none select-none ${
                        header.column.getIsResizing()
                          ? "bg-blue-500"
                          : "hover:bg-blue-400/60"
                      }`}
                    />
                  )}
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
                // `row.index`, not the loop counter: the memo comparator uses
                // this to decide whether the row's checkbox needs repainting,
                // and the cell itself reads selection by `row.index`. They
                // diverge whenever the visible rows aren't the whole sheet —
                // page 2, or any active filter — and a stale hint means a
                // click that doesn't visibly tick the box.
                selected={meta?.selectedRowIndices?.has(row.index) ?? false}
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
                          style={cellFreezeStyle(fz, col.getSize())}
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
    </div>
      {/* Outside the scroll pane: the pager used to live inside it, so on a
          wide sheet it slid off to the right along with the columns. */}
      <TablePagination
        table={table}
        totalCount={serverPagination?.totalCount}
      />
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


import React from "react";
import type { useReactTable } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
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
import { makeBlankRow } from "./fef-cells";
import {
  GUTTER_WIDTH,
  type FefTableMeta,
  type FrozenColumn,
  type ServerPagination,
} from "./fef-table-types";

/**
 * All Excel-style range-editing state and behavior for the FEF grid: cell
 * selection, keyboard shortcuts, the fill-handle drag, the selection status
 * bar, the right-click context menu, find & replace, click-header sort, and
 * frozen-column offsets. Extracted from FefTableContent so the component is
 * just table setup + this hook + render. Runs unconditionally; behavior is
 * gated on `enableRangeEditing`.
 */
export function useGridRangeEditing({
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
  // Includes the sizing map: the frozen columns' sticky-left offsets are sums
  // of the widths to their left, so a resize has to recompute them or the
  // pinned columns drift out of line with the cells they sit above.
  const frozenKey = `${frozenColumnCount}|${columnIds.join(",")}|${JSON.stringify(
    table.getState().columnSizing,
  )}`;
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

  // The scrolling grid container. Every range shortcut is bound there via
  // onKeyDownCapture, so it only sees a keystroke while DOM focus is inside it
  // — normally a cell <input>/<select>. Selections made by clicking the row
  // gutter, a column header, or the select-all corner, and drags of the fill
  // handle (which preventDefault to keep the drag clean), all set a selection
  // WITHOUT moving focus there. Those handlers hand focus to this element so
  // the shortcuts keep working; otherwise focus stays on <body> and Ctrl+D
  // reaches the browser as "bookmark page".
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const focusGrid = React.useCallback(() => {
    gridRef.current?.focus({ preventScroll: true });
  }, []);

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
      // Sheet-specific lookups; present only on the sheet that uses them, which
      // is also how a range write tells a piping row from a steel one.
      pipingFactorLookup: meta?.pipingFactorLookup,
      weldGroupMaterialMap: meta?.weldGroupMaterialMap,
      steelMemberUomLookup: meta?.steelMemberUomLookup,
    }),
    [
      meta?.roleOptions,
      meta?.scheduleOptions,
      meta?.roleRates,
      meta?.areaOptions,
      meta?.cbsOptions,
      meta?.crewMixOptions,
      meta?.pipingFactorLookup,
      meta?.weldGroupMaterialMap,
      meta?.steelMemberUomLookup,
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

  const onFillHandleDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      focusGrid();
      setFilling(true);
    },
    [focusGrid],
  );

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
  const onRowHeaderClick = React.useCallback(
    (rowIndex: number) => {
      const cc = latest.current.columnIds.length;
      focusGrid();
      setSelection({
        anchor: { row: rowIndex, col: 0 },
        focus: { row: rowIndex, col: Math.max(0, cc - 1) },
      });
    },
    [focusGrid],
  );
  const onColHeaderClick = React.useCallback(
    (colIndex: number) => {
      const { firstRowIndex: fr, lastRowIndex: lr } = latest.current;
      focusGrid();
      setSelection({
        anchor: { row: fr, col: colIndex },
        focus: { row: lr, col: colIndex },
      });
    },
    [focusGrid],
  );
  const onSelectAll = React.useCallback(() => {
    const { firstRowIndex: fr, lastRowIndex: lr, columnIds: cids } =
      latest.current;
    focusGrid();
    setSelection({
      anchor: { row: fr, col: 0 },
      focus: { row: lr, col: Math.max(0, cids.length - 1) },
    });
  }, [focusGrid]);

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
    gridRef,
    rows, frozen, rangeSel, rangeHandlers, onGridKeyDown, onGridPaste, stats,
    fmtStat, menu, menuCopy, menuCut, menuPaste, menuClear, menuInsert,
    menuDeleteRows, selectedRowCount, find, setFind, findIndex, setFindIndex,
    matches, goToMatch, doReplaceOne, doReplaceAll, sortState, onColSort,
    onColHeaderClick, onSelectAll,
  };
}

// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGridRangeEditing } from "./use-grid-range-editing";
import { makeFefRow } from "./fef-helpers";
import type { FefRow } from "./types";

/**
 * The Excel-style range-editing hook behind the FEF / Piping grids: selection,
 * keyboard shortcuts, the context menu, find & replace, sort, and frozen-column
 * offsets.
 *
 * The hook only reads four things off the TanStack table (`getRowModel().rows`,
 * `getVisibleLeafColumns()`, each column's `getSize()`, and
 * `getState().columnSizing`), so a structural stub stands in for it — building a
 * real table would drag in the whole column definition set without exercising
 * anything extra.
 */

// Plain free-text / numeric columns. Deliberately NOT `name`: that column is
// the CBS-item picker, so fill-down and replace resolve their value against
// `cbsOptions` and correctly skip the write when it does not resolve.
const COLS = ["description", "quantity", "notes"];

function row(i: number, description: string): FefRow {
  return makeFefRow({ id: `r${i}`, description, quantity: String(i) });
}

/** Stub of the slice of `useReactTable` the hook actually touches. */
function makeTable(data: FefRow[], columnIds = COLS, sizes = [100, 80, 60]) {
  return {
    getRowModel: () => ({
      rows: data.map((r, index) => ({ index, original: r })),
    }),
    getVisibleLeafColumns: () =>
      columnIds.map((id, i) => ({ id, getSize: () => sizes[i] ?? 100 })),
    getState: () => ({ columnSizing: {} }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

type HarnessOpts = {
  enableRangeEditing?: boolean;
  frozenColumnCount?: number;
  initial?: FefRow[];
};

/** Drives the hook with real React state so `setData` round-trips. */
function useHarness(opts: HarnessOpts = {}) {
  const [data, setData] = React.useState<FefRow[]>(
    opts.initial ?? [row(0, "alpha"), row(1, "bravo"), row(2, "charlie")],
  );
  const [, setLocalPageIndex] = React.useState(0);
  const grid = useGridRangeEditing({
    enableRangeEditing: opts.enableRangeEditing ?? true,
    data,
    setData,
    table: makeTable(data),
    meta: {},
    setLocalPageIndex,
    frozenColumnCount: opts.frozenColumnCount ?? 0,
  });
  return { data, ...grid };
}

const render = (opts: HarnessOpts = {}) => renderHook(() => useHarness(opts));

/** A React KeyboardEvent stand-in carrying the fields the handler reads. */
function keyEvent(key: string, mods: Partial<Record<string, boolean>> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { tagName: "INPUT" },
  } as unknown as React.KeyboardEvent;
}

function mouseEvent(mods: Partial<Record<string, boolean>> = {}) {
  return {
    shiftKey: false,
    clientX: 10,
    clientY: 20,
    ...mods,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

/** Selects a range by focusing the anchor then shift-clicking the focus cell. */
function selectRange(
  result: { current: ReturnType<typeof useHarness> },
  anchor: [number, number],
  focus: [number, number],
) {
  act(() => result.current.rangeHandlers.onCellFocus(anchor[0], anchor[1]));
  act(() =>
    result.current.rangeHandlers.onCellPointerDown(
      focus[0],
      focus[1],
      mouseEvent({ shiftKey: true }),
    ),
  );
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(), readText: vi.fn() },
  });
});

describe("selection", () => {
  it("collapses to the focused cell on plain focus", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(1, 2));
    expect(result.current.rangeSel).toEqual({
      minRow: 1,
      maxRow: 1,
      minCol: 2,
      maxCol: 2,
    });
  });

  it("extends the range on shift+click without moving the anchor", () => {
    const { result } = render();
    selectRange(result, [0, 0], [2, 2]);
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: 2,
    });
  });

  it("ignores a pointer-down without shift (plain clicks focus instead)", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() =>
      result.current.rangeHandlers.onCellPointerDown(2, 2, mouseEvent()),
    );
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 0,
      minCol: 0,
      maxCol: 0,
    });
  });

  it("normalizes a range dragged up-left into min/max order", () => {
    const { result } = render();
    selectRange(result, [2, 2], [0, 0]);
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: 2,
    });
  });

  it("selects the whole row from the row-number gutter", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onRowHeaderClick(1));
    expect(result.current.rangeSel).toEqual({
      minRow: 1,
      maxRow: 1,
      minCol: 0,
      maxCol: COLS.length - 1,
    });
  });

  it("selects the whole column from the column header", () => {
    const { result } = render();
    act(() => result.current.onColHeaderClick(1));
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 1,
      maxCol: 1,
    });
  });

  it("selects the entire grid from the corner", () => {
    const { result } = render();
    act(() => result.current.onSelectAll());
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: COLS.length - 1,
    });
  });

  it("reports no selection while range editing is disabled", () => {
    const { result } = render({ enableRangeEditing: false });
    act(() => result.current.rangeHandlers.onCellFocus(1, 1));
    expect(result.current.rangeSel).toBeNull();
  });
});

describe("keyboard shortcuts", () => {
  it("extends by one cell on shift+arrow", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() =>
      result.current.onGridKeyDown(keyEvent("ArrowDown", { shiftKey: true })),
    );
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 1,
      minCol: 0,
      maxCol: 0,
    });
  });

  it("clamps shift+arrow at the grid edges", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() =>
      result.current.onGridKeyDown(keyEvent("ArrowUp", { shiftKey: true })),
    );
    act(() =>
      result.current.onGridKeyDown(keyEvent("ArrowLeft", { shiftKey: true })),
    );
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 0,
      minCol: 0,
      maxCol: 0,
    });
  });

  it("jumps to the far edge on ctrl+shift+arrow", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() =>
      result.current.onGridKeyDown(
        keyEvent("ArrowDown", { shiftKey: true, ctrlKey: true }),
      ),
    );
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: 0,
    });
  });

  it("selects the whole grid on ctrl+A", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(1, 1));
    act(() => result.current.onGridKeyDown(keyEvent("a", { ctrlKey: true })));
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: COLS.length - 1,
    });
  });

  it("collapses a multi-cell selection to its focus on Escape", () => {
    const { result } = render();
    selectRange(result, [0, 0], [2, 2]);
    act(() => result.current.onGridKeyDown(keyEvent("Escape")));
    expect(result.current.rangeSel).toEqual({
      minRow: 2,
      maxRow: 2,
      minCol: 2,
      maxCol: 2,
    });
  });

  it("fills down over a multi-cell range on ctrl+D", () => {
    const { result } = render();
    selectRange(result, [0, 0], [2, 0]);
    act(() => result.current.onGridKeyDown(keyEvent("d", { ctrlKey: true })));
    expect(result.current.data.map((r) => r.description)).toEqual([
      "alpha",
      "alpha",
      "alpha",
    ]);
  });

  it("leaves data untouched when ctrl+D hits a single cell", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() => result.current.onGridKeyDown(keyEvent("d", { ctrlKey: true })));
    expect(result.current.data.map((r) => r.description)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("clears a multi-cell range on Delete", () => {
    const { result } = render();
    selectRange(result, [0, 0], [2, 0]);
    act(() => result.current.onGridKeyDown(keyEvent("Delete")));
    expect(result.current.data.map((r) => r.description)).toEqual(["", "", ""]);
  });

  it("leaves data untouched when Delete hits a single cell", () => {
    // Single-cell delete belongs to the focused input's own editing, not the
    // range layer — intercepting it would eat ordinary backspaces.
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() => result.current.onGridKeyDown(keyEvent("Delete")));
    expect(result.current.data.map((r) => r.description)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("copies a multi-cell range to the clipboard on ctrl+C", () => {
    const { result } = render();
    selectRange(result, [0, 0], [1, 0]);
    act(() => result.current.onGridKeyDown(keyEvent("c", { ctrlKey: true })));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("alpha\nbravo");
  });

  it("cuts on ctrl+X — clipboard gets the values, the cells go blank", () => {
    const { result } = render();
    selectRange(result, [0, 0], [1, 0]);
    act(() => result.current.onGridKeyDown(keyEvent("x", { ctrlKey: true })));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("alpha\nbravo");
    expect(result.current.data.map((r) => r.description)).toEqual(["", "", "charlie"]);
  });

  it("ignores every shortcut while range editing is disabled", () => {
    const { result } = render({ enableRangeEditing: false });
    act(() => result.current.rangeHandlers.onCellFocus(0, 0));
    act(() => result.current.onGridKeyDown(keyEvent("a", { ctrlKey: true })));
    expect(result.current.rangeSel).toBeNull();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe("find & replace", () => {
  it("opens the bar in find mode on ctrl+F and replace mode on ctrl+H", () => {
    const { result } = render();
    act(() => result.current.onGridKeyDown(keyEvent("f", { ctrlKey: true })));
    expect(result.current.find?.mode).toBe("find");
    act(() => result.current.onGridKeyDown(keyEvent("h", { ctrlKey: true })));
    // An already-open bar switches mode rather than resetting the query.
    expect(result.current.find?.mode).toBe("replace");
  });

  it("finds every matching cell", () => {
    const { result } = render();
    act(() =>
      result.current.setFind({ query: "a", replace: "", mode: "find" }),
    );
    // "alpha", "bravo" and "charlie" all contain an "a".
    expect(result.current.matches.length).toBeGreaterThanOrEqual(3);
  });

  it("wraps around when stepping past the last match", () => {
    const { result } = render();
    act(() =>
      result.current.setFind({ query: "alpha", replace: "", mode: "find" }),
    );
    const count = result.current.matches.length;
    act(() => result.current.goToMatch(count));
    expect(result.current.findIndex).toBe(0);
  });

  it("steps backwards from the first match to the last", () => {
    const { result } = render();
    act(() => result.current.setFind({ query: "a", replace: "", mode: "find" }));
    const count = result.current.matches.length;
    act(() => result.current.goToMatch(-1));
    expect(result.current.findIndex).toBe(count - 1);
  });

  it("replaces every occurrence on replace-all", () => {
    const { result } = render();
    act(() =>
      result.current.setFind({ query: "a", replace: "X", mode: "replace" }),
    );
    act(() => result.current.doReplaceAll());
    expect(result.current.data.map((r) => r.description)).toEqual([
      "XlphX",
      "brXvo",
      "chXrlie",
    ]);
  });

  it("reports no matches when the find bar is closed", () => {
    const { result } = render();
    expect(result.current.matches).toEqual([]);
  });
});

describe("context menu", () => {
  it("keeps a multi-cell selection when right-clicking inside it", () => {
    const { result } = render();
    selectRange(result, [0, 0], [2, 2]);
    act(() =>
      result.current.rangeHandlers.onCellContextMenu(1, 1, mouseEvent()),
    );
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: 2,
    });
    expect(result.current.menu).toEqual({ x: 10, y: 20 });
  });

  it("collapses to the clicked cell when right-clicking outside the selection", () => {
    const { result } = render();
    selectRange(result, [0, 0], [1, 1]);
    act(() =>
      result.current.rangeHandlers.onCellContextMenu(2, 2, mouseEvent()),
    );
    expect(result.current.rangeSel).toEqual({
      minRow: 2,
      maxRow: 2,
      minCol: 2,
      maxCol: 2,
    });
  });

  it("inserts rows above the selection and closes the menu", () => {
    const { result } = render();
    selectRange(result, [1, 0], [1, 0]);
    act(() =>
      result.current.rangeHandlers.onCellContextMenu(1, 0, mouseEvent()),
    );
    act(() => result.current.menuInsert("above"));
    expect(result.current.data.map((r) => r.description)).toEqual([
      "alpha",
      "",
      "bravo",
      "charlie",
    ]);
    expect(result.current.menu).toBeNull();
  });

  it("inserts below the last row of the selection", () => {
    const { result } = render();
    selectRange(result, [0, 0], [1, 0]);
    act(() => result.current.menuInsert("below"));
    // Two rows selected → two rows inserted, after row index 1.
    expect(result.current.data.map((r) => r.description)).toEqual([
      "alpha",
      "bravo",
      "",
      "",
      "charlie",
    ]);
  });

  it("deletes the selected rows and collapses the selection to the anchor", () => {
    const { result } = render();
    selectRange(result, [0, 0], [1, 0]);
    act(() => result.current.menuDeleteRows());
    expect(result.current.data.map((r) => r.description)).toEqual(["charlie"]);
    expect(result.current.rangeSel).toEqual({
      minRow: 0,
      maxRow: 0,
      minCol: 0,
      maxCol: 0,
    });
  });

  it("reports the selected row count for the menu labels", () => {
    const { result } = render();
    selectRange(result, [0, 0], [2, 1]);
    expect(result.current.selectedRowCount).toBe(3);
  });
});

describe("selection stats", () => {
  it("computes stats only once the selection spans multiple cells", () => {
    const { result } = render();
    act(() => result.current.rangeHandlers.onCellFocus(0, 1));
    expect(result.current.stats).toBeNull();

    selectRange(result, [0, 1], [2, 1]);
    // quantity column holds "0", "1", "2".
    expect(result.current.stats).toMatchObject({ count: 3, sum: 3 });
  });
});

describe("frozen columns", () => {
  it("returns no offsets when nothing is frozen", () => {
    const { result } = render({ frozenColumnCount: 0 });
    expect(result.current.frozen).toBeUndefined();
  });

  it("stacks sticky-left offsets after the row gutter", () => {
    const { result } = render({ frozenColumnCount: 2 });
    // GUTTER_WIDTH is 44; column widths are 100 and 80.
    expect(result.current.frozen).toEqual([
      { left: 44, width: 100 },
      { left: 144, width: 80 },
      null,
    ]);
  });
});

describe("sort", () => {
  it("sorts ascending, then toggles to descending on a repeat click", () => {
    const { result } = render();
    act(() => result.current.onColSort("description"));
    expect(result.current.sortState).toEqual({ colId: "description", dir: "asc" });
    expect(result.current.data.map((r) => r.description)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);

    act(() => result.current.onColSort("description"));
    expect(result.current.sortState).toEqual({ colId: "description", dir: "desc" });
    expect(result.current.data.map((r) => r.description)).toEqual([
      "charlie",
      "bravo",
      "alpha",
    ]);
  });

  it("restarts at ascending when a different column is clicked", () => {
    const { result } = render();
    act(() => result.current.onColSort("description"));
    act(() => result.current.onColSort("description"));
    act(() => result.current.onColSort("quantity"));
    expect(result.current.sortState).toEqual({ colId: "quantity", dir: "asc" });
  });
});

// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { makeFefRow, fefRowHasUserData } from "./fef-helpers";
import type { FefRow } from "./types";
import type { FefTableState } from "./table-utils";

// Hoisted so the vi.mock factories (which run before top-level code) can read
// the value each test sets for what the persistence query "returns".
const h = vi.hoisted(() => ({
  loadedRows: undefined as FefRow[] | undefined,
}));

vi.mock("~/lib/selected-version", () => ({
  useSelectedVersion: () => ({ isHydrated: true }),
}));

vi.mock("~/utils/fefRows", () => ({
  fefRowsQueryOptions: () => ({
    queryKey: ["fefRows"],
    queryFn: async () => [],
  }),
  saveFefRows: vi.fn(async () => []),
}));

vi.mock("@tanstack/react-query", async (importActual) => {
  const actual = await importActual<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({ data: h.loadedRows, isError: false }),
    useQueryClient: () => ({
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    }),
  };
});

import { useFefRowPersistence } from "./use-fef-row-persistence";
import { saveFefRows } from "~/utils/fefRows";

const blank = (i: number): FefRow => makeFefRow({ id: `__fe-blank-${i}` });
const filled = (id: string, name: string): FefRow => makeFefRow({ id, name });

function useHarness(versionId: number) {
  const [data, setData] = React.useState<FefRow[]>([blank(0)]);
  const state = { data, setData } as unknown as FefTableState;
  useFefRowPersistence({
    versionId,
    discipline: "piping",
    section: "TAKE_OFF",
    state,
    emptyRows: [blank(0)],
  });
  return data;
}

const names = (rows: FefRow[]) => rows.map((r) => r.name).filter(Boolean);

describe("useFefRowPersistence — version switch", () => {
  it("clears the previous version's rows when switching to an empty take-off", () => {
    h.loadedRows = [filled("601-10-0000-00-L", "Pipe")];
    const { result, rerender } = renderHook(({ pid }) => useHarness(pid), {
      initialProps: { pid: 1 },
    });
    expect(names(result.current)).toEqual(["Pipe"]);

    // Switch to version 2, whose take-off has no saved rows.
    h.loadedRows = [];
    act(() => rerender({ pid: 2 }));

    // No carryover: the grid is back to blank rows, not version 1's "Pipe".
    expect(names(result.current)).toEqual([]);
    expect(result.current.every((r) => r.id.startsWith("__fe-blank-"))).toBe(
      true,
    );
  });

  it("hydrates the newly-selected version's rows on switch", () => {
    h.loadedRows = [filled("A", "Alpha")];
    const { result, rerender } = renderHook(({ pid }) => useHarness(pid), {
      initialProps: { pid: 1 },
    });
    expect(names(result.current)).toEqual(["Alpha"]);

    h.loadedRows = [filled("B", "Beta")];
    act(() => rerender({ pid: 2 }));

    expect(names(result.current)).toEqual(["Beta"]);
  });
});

describe("useFefRowPersistence — no spurious autosave", () => {
  it("does not save when only hydrating or switching versions (no real edit)", () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      // Mount on a version whose sheet already has saved rows.
      h.loadedRows = [filled("A", "Alpha")];
      const { rerender } = renderHook(({ pid }) => useHarness(pid), {
        initialProps: { pid: 1 },
      });
      act(() => vi.advanceTimersByTime(1000));
      // Hydration alone must not persist anything back.
      expect(saveFefRows).not.toHaveBeenCalled();

      // Switch to another version with its own saved rows.
      h.loadedRows = [filled("B", "Beta")];
      act(() => rerender({ pid: 2 }));
      act(() => vi.advanceTimersByTime(1000));
      // Switching versions is not an edit — the persistable content signature
      // is unchanged, so no redundant save (and no save→re-hydrate cycle) fires.
      expect(saveFefRows).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// A harness shaped like the real page: DisciplineTabs pairs the persistence
// hook with `useEnsureTrailingBlankRows`, which tops the sheet up to 20 rows.
// That top-up is what turns a momentarily-blank grid into a full-size blank
// sheet — and it commits separately from the reset, so it survives the
// one-shot `skipNextSave` flag and reaches the autosave on its own.
const TAKE_OFF_EMPTY_ROWS = [blank(0)];

function useGridHarness(versionId: number | null) {
  const [data, setData] = React.useState<FefRow[]>(TAKE_OFF_EMPTY_ROWS);
  const state = { data, setData } as unknown as FefTableState;

  useFefRowPersistence({
    versionId,
    discipline: "piping",
    section: "TAKE_OFF",
    state,
    emptyRows: TAKE_OFF_EMPTY_ROWS,
  });

  const nextBlankId = React.useRef(1);
  React.useEffect(() => {
    let trailing = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const r = data[i];
      if (r.id.startsWith("__fe-blank-") && !fefRowHasUserData(r)) trailing++;
      else break;
    }
    const need = Math.max(5 - trailing, 20 - data.length);
    if (need <= 0) return;
    setData((prev) => {
      const next = prev.slice();
      for (let i = 0; i < need; i++) next.push(blank(nextBlankId.current++));
      return next;
    });
  }, [data, setData]);

  return data;
}

/** The rows each saveFefRows call would actually have persisted. */
function persistedRowCounts() {
  return vi
    .mocked(saveFefRows)
    .mock.calls.map(
      (c) =>
        (c[0] as { data: { rows: FefRow[] } }).data.rows.filter(
          (r) => !r.id.startsWith("__fe-blank-") || fefRowHasUserData(r),
        ).length,
    );
}

describe("useFefRowPersistence — key leaves and returns", () => {
  const FIVE = [
    filled("603-MB-ST00-00-C", "A"),
    filled("603-MB-ST01-00-C", "B"),
    filled("603-MB-ST02-00-C", "C"),
    filled("603-MB-ST03-00-C", "D"),
    filled("603-MB-ST04-00-C", "E"),
  ];

  it("re-hydrates instead of persisting the blank slate", () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      h.loadedRows = FIVE;
      const { result, rerender } = renderHook(({ v }) => useGridHarness(v), {
        initialProps: { v: 1 as number | null },
      });
      act(() => vi.advanceTimersByTime(1000));
      expect(names(result.current)).toEqual(["A", "B", "C", "D", "E"]);

      // The key goes away (an unresolved version) and comes back — the sheet is
      // still in the query cache, so nothing was actually lost server-side.
      h.loadedRows = undefined;
      act(() => rerender({ v: null }));
      act(() => vi.advanceTimersByTime(1000));

      h.loadedRows = FIVE;
      act(() => rerender({ v: 1 }));
      act(() => vi.advanceTimersByTime(1000));

      // The grid shows the rows again...
      expect(names(result.current)).toEqual(["A", "B", "C", "D", "E"]);
      // ...and no save ever carried an empty sheet, which would have deleted
      // all five rows on the server.
      expect(persistedRowCounts()).not.toContain(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The save itself, and the `allowClear` flag it carries.
 *
 * Every other test in this file asserts a save does NOT happen, which left the
 * save body — and `allowClear` in particular — unexercised. That flag is what
 * stands between an emptied grid and a deleted sheet: three sheets of work were
 * lost this way (steel 144 rows, piping 444), each save reporting success. It
 * is only true when the client has seen what the server holds AND the user
 * actually removed rows.
 */
function useEditHarness(versionId: number | null) {
  const [data, setData] = React.useState<FefRow[]>([blank(0)]);
  const state = { data, setData } as unknown as FefTableState;
  const api = useFefRowPersistence({
    versionId,
    discipline: "piping",
    section: "TAKE_OFF",
    state,
    emptyRows: [blank(0)],
  });
  return { data, setData, notifyRowsRemoved: api.notifyRowsRemoved };
}

/** The `data` payload of the Nth saveFefRows call. */
function saveCall(n: number) {
  const call = vi.mocked(saveFefRows).mock.calls[n];
  return (
    call[0] as {
      data: {
        versionId: number;
        discipline: string;
        section: string;
        rows: FefRow[];
        allowClear: boolean;
      };
    }
  ).data;
}

describe("useFefRowPersistence — the save itself", () => {
  /**
   * Fires the debounce, then lets the in-flight save settle. The second half
   * matters: `rowsRemovedRef` is consumed in the save's `.then()`, so without
   * flushing the microtask queue the flag outlives the save it belonged to.
   */
  async function settle() {
    act(() => vi.advanceTimersByTime(1000));
    await act(async () => {});
  }

  /** Mounts on a synced sheet of `loaded`, past hydration, with no saves yet. */
  async function mountSynced(loaded: FefRow[]) {
    h.loadedRows = loaded;
    const r = renderHook(({ v }) => useEditHarness(v), {
      initialProps: { v: 1 as number | null },
    });
    await settle();
    expect(saveFefRows).not.toHaveBeenCalled();
    return r;
  }

  it("persists a real edit, and does not authorise a clear", async () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      const { result } = await mountSynced([filled("A", "Alpha")]);

      act(() =>
        result.current.setData([filled("A", "Alpha"), filled("B", "Beta")]),
      );
      await settle();

      expect(saveFefRows).toHaveBeenCalledTimes(1);
      const sent = saveCall(0);
      expect(names(sent.rows)).toEqual(["Alpha", "Beta"]);
      expect(sent).toMatchObject({
        versionId: 1,
        discipline: "piping",
        section: "TAKE_OFF",
      });
      // Nothing was deleted, so this save may not be read as a deletion.
      expect(sent.allowClear).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("debounces a burst of edits into one save of the final state", async () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      const { result } = await mountSynced([filled("A", "Alpha")]);

      act(() => result.current.setData([filled("A", "One")]));
      act(() => vi.advanceTimersByTime(50));
      act(() => result.current.setData([filled("A", "Two")]));
      act(() => vi.advanceTimersByTime(50));
      act(() => result.current.setData([filled("A", "Three")]));
      await settle();

      expect(saveFefRows).toHaveBeenCalledTimes(1);
      expect(names(saveCall(0).rows)).toEqual(["Three"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("authorises a clear only once the user actually removed rows", async () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      const { result } = await mountSynced([
        filled("A", "Alpha"),
        filled("B", "Beta"),
      ]);

      // The grid's delete-rows path tells the hook the emptying was deliberate.
      act(() => result.current.notifyRowsRemoved());
      act(() => result.current.setData([blank(0)]));
      await settle();

      expect(saveFefRows).toHaveBeenCalledTimes(1);
      expect(saveCall(0).allowClear).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("consumes the authorisation — a later save must justify its own clear", async () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      const { result } = await mountSynced([
        filled("A", "Alpha"),
        filled("B", "Beta"),
      ]);

      act(() => result.current.notifyRowsRemoved());
      act(() => result.current.setData([filled("A", "Alpha")]));
      await settle();
      expect(saveCall(0).allowClear).toBe(true);

      // A second edit with no further deletion must not inherit the flag,
      // or any later client fault that empties the grid reads as a deletion.
      act(() =>
        result.current.setData([filled("A", "Alpha"), filled("C", "Gamma")]),
      );
      await settle();

      expect(saveFefRows).toHaveBeenCalledTimes(2);
      expect(saveCall(1).allowClear).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not carry removal intent across a version switch", async () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      h.loadedRows = [filled("A", "Alpha")];
      const { result, rerender } = renderHook(({ v }) => useEditHarness(v), {
        initialProps: { v: 1 as number | null },
      });
      await settle();

      // Rows deleted on version 1 — then the user switches sheets instead of
      // letting the save land. The intent belongs to the sheet it was
      // expressed on, so an edit on version 2 must not clear version 2.
      act(() => result.current.notifyRowsRemoved());
      h.loadedRows = [filled("B", "Beta")];
      act(() => rerender({ v: 2 }));
      await settle();

      act(() =>
        result.current.setData([filled("B", "Beta"), filled("C", "Gamma")]),
      );
      await settle();

      expect(saveFefRows).toHaveBeenCalledTimes(1);
      expect(saveCall(0)).toMatchObject({ versionId: 2, allowClear: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useFefRowPersistence — no baseline, no autosave", () => {
  it("does not save when the load errored", () => {
    vi.mocked(saveFefRows).mockClear();
    vi.useFakeTimers();
    try {
      // Errored queries expose `data === undefined`; the hook un-gates the load
      // mask so the page can render, but it has no idea what the server holds.
      h.loadedRows = undefined;
      renderHook(() => useGridHarness(1), {});
      act(() => vi.advanceTimersByTime(1000));
      expect(saveFefRows).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

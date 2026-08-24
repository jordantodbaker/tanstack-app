// @vitest-environment jsdom
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
  fefRowsQueryOptions: () => ({ queryKey: ["fefRows"], queryFn: async () => [] }),
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
    expect(result.current.every((r) => r.id.startsWith("__fe-blank-"))).toBe(true);
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
  return vi.mocked(saveFefRows).mock.calls.map(
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

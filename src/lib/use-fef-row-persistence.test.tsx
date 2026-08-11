// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { makeFefRow } from "./fef-helpers";
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

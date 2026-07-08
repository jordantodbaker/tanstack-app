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

vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({ isHydrated: true }),
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

const blank = (i: number): FefRow => makeFefRow({ id: `__fe-blank-${i}` });
const filled = (id: string, name: string): FefRow => makeFefRow({ id, name });

function useHarness(projectId: number) {
  const [data, setData] = React.useState<FefRow[]>([blank(0)]);
  const state = { data, setData } as unknown as FefTableState;
  useFefRowPersistence({
    projectId,
    discipline: "piping",
    section: "TAKE_OFF",
    state,
    emptyRows: [blank(0)],
  });
  return data;
}

const names = (rows: FefRow[]) => rows.map((r) => r.name).filter(Boolean);

describe("useFefRowPersistence — project switch", () => {
  it("clears the previous project's rows when switching to an empty take-off", () => {
    h.loadedRows = [filled("601-10-0000-00-L", "Pipe")];
    const { result, rerender } = renderHook(({ pid }) => useHarness(pid), {
      initialProps: { pid: 1 },
    });
    expect(names(result.current)).toEqual(["Pipe"]);

    // Switch to project 2, whose take-off has no saved rows.
    h.loadedRows = [];
    act(() => rerender({ pid: 2 }));

    // No carryover: the grid is back to blank rows, not project 1's "Pipe".
    expect(names(result.current)).toEqual([]);
    expect(result.current.every((r) => r.id.startsWith("__fe-blank-"))).toBe(true);
  });

  it("hydrates the newly-selected project's rows on switch", () => {
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

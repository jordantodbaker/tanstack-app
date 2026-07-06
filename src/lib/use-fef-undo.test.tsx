// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFefUndo } from "./use-fef-undo";
import { makeFefRow } from "./fef-helpers";
import type { FefRow } from "./types";
import type { FefTableState } from "./table-utils";

const blank = (i: number): FefRow => makeFefRow({ id: `__fe-blank-${i}` });
const filled = (id: string, name: string): FefRow =>
  makeFefRow({ id, name, laborHours: "10", laborRate: "50" });

/** Minimal harness: real React state wired into `useFefUndo`, exposing the
 *  current data plus the hook's controls. `enabled`/`resetKey` are read from
 *  refs so tests can flip them between renders. */
function useHarness(initial: FefRow[]) {
  const [data, setData] = React.useState<FefRow[]>(initial);
  const [enabled, setEnabled] = React.useState(true);
  const [resetKey, setResetKey] = React.useState("k1");
  // Only `data`/`setData` are read by the hook.
  const state = { data, setData } as unknown as FefTableState;
  const undo = useFefUndo(state, { enabled, resetKey });
  return { data, setData, setEnabled, setResetKey, ...undo };
}

describe("useFefUndo", () => {
  it("records an edit and undoes/redoes it", () => {
    const { result } = renderHook(() => useHarness([blank(0)]));

    expect(result.current.canUndo).toBe(false);

    act(() => result.current.setData([filled("01-100", "Pump")]));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.data[0].name).toBe("Pump");

    act(() => result.current.undo());
    expect(result.current.data[0].id).toBe("__fe-blank-0");
    expect(result.current.data[0].name).toBe("");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.data[0].name).toBe("Pump");
    expect(result.current.canRedo).toBe(false);
  });

  it("folds a trailing-blank auto-append into the prior state (one undo)", () => {
    const { result } = renderHook(() => useHarness([blank(0)]));

    // Fill the row (one logical edit)...
    act(() => result.current.setData([filled("01-100", "Pump")]));
    // ...then the auto-append effect adds a trailing blank.
    act(() =>
      result.current.setData((prev) => [...prev, blank(1)]),
    );

    // Still a single undo step, and it lands on the original blank row.
    act(() => result.current.undo());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].name).toBe("");
    expect(result.current.canUndo).toBe(false);
  });

  it("does not record edits while disabled (hydration)", () => {
    const { result } = renderHook(() => useHarness([blank(0)]));

    act(() => result.current.setEnabled(false));
    act(() => result.current.setData([filled("01-100", "Loaded")]));
    expect(result.current.canUndo).toBe(false);

    // Re-enabled edits record normally against the hydrated baseline.
    act(() => result.current.setEnabled(true));
    act(() => result.current.setData([filled("01-100", "Edited")]));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.data[0].name).toBe("Loaded");
  });

  it("clears history when resetKey changes", () => {
    const { result } = renderHook(() => useHarness([blank(0)]));

    act(() => result.current.setData([filled("01-100", "Pump")]));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.setResetKey("k2"));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("a new edit after undo clears the redo stack", () => {
    const { result } = renderHook(() => useHarness([blank(0)]));

    act(() => result.current.setData([filled("01-100", "A")]));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.setData([filled("01-100", "B")]));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });
});

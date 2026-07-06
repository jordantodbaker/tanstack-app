import * as React from "react";
import type { FefRow } from "~/lib/types";
import type { FefTableState } from "~/lib/table-utils";
import { fefRowHasUserData } from "~/lib/fef-helpers";

/** Cap on retained history so a long editing session can't grow the undo
 *  stack without bound. Oldest entries drop off first. */
const MAX_HISTORY = 100;

/**
 * True when `next` is `prev` with only blank, data-less rows appended at the
 * end — the signature of `useAutoAppendBlankRow`. Such transitions are folded
 * into the previous state rather than recorded as their own undo step. Two
 * reasons: a single logical edit shouldn't cost two undos (the edit, then the
 * auto-appended blank), and — more importantly — if the append were its own
 * step, undoing it would land on a state whose last row is again computable,
 * so the auto-append effect would immediately re-fire and cancel the undo.
 */
function isTrailingBlankAppend(prev: FefRow[], next: FefRow[]): boolean {
  if (next.length <= prev.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (next[i] !== prev[i]) return false;
  }
  for (let i = prev.length; i < next.length; i++) {
    const r = next[i];
    if (!r.id.startsWith("__fe-blank-") || fefRowHasUserData(r)) return false;
  }
  return true;
}

/**
 * Undo/redo over a `FefTableState`'s row data. Observes `data` and records a
 * snapshot before each user-driven change; `undo`/`redo` replay snapshots via
 * `setData`.
 *
 * Coordinated with the table's two automatic `setData` sources so neither
 * pollutes history: hydration from the DB (guarded by `enabled` — pass
 * `false` until the persistence hook settles) and the trailing-blank
 * auto-append (folded via `isTrailingBlankAppend`). Changes that `undo`/`redo`
 * themselves make are recognized and adopted as the new baseline rather than
 * re-recorded.
 *
 * `resetKey` clears history when it changes (e.g. switching project or
 * discipline re-hydrates a different row set that shouldn't share an undo
 * stack with the previous one).
 */
export function useFefUndo(
  state: FefTableState,
  { enabled, resetKey }: { enabled: boolean; resetKey: string },
): { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } {
  const { data, setData } = state;
  const past = React.useRef<FefRow[][]>([]);
  const future = React.useRef<FefRow[][]>([]);
  const baseline = React.useRef<FefRow[]>(data);
  // Set while an undo/redo-issued setData is in flight so the observing effect
  // adopts the result as baseline instead of recording it as a fresh edit.
  const applying = React.useRef(false);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  // Reset history whenever the underlying row set is swapped wholesale.
  React.useEffect(() => {
    past.current = [];
    future.current = [];
    baseline.current = data;
    applying.current = false;
    bump();
    // Only `resetKey` should trigger a reset; `data` is captured intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  React.useEffect(() => {
    if (data === baseline.current) return;
    if (applying.current) {
      applying.current = false;
      baseline.current = data;
      return;
    }
    // Before hydration settles, track the baseline but don't record — so the
    // first real edit diffs against the loaded rows, not the placeholder.
    if (!enabled) {
      baseline.current = data;
      return;
    }
    if (isTrailingBlankAppend(baseline.current, data)) {
      baseline.current = data;
      return;
    }
    past.current.push(baseline.current);
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
    baseline.current = data;
    bump();
  }, [data, enabled]);

  const undo = React.useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current.pop()!;
    future.current.push(baseline.current);
    applying.current = true;
    setData(prev);
    bump();
  }, [setData]);

  const redo = React.useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current.pop()!;
    past.current.push(baseline.current);
    applying.current = true;
    setData(next);
    bump();
  }, [setData]);

  return {
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

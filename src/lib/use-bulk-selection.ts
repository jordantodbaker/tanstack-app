import * as React from "react";
import {
  bulkActionsForSelection,
  runBulk,
  type BulkActionGroup,
  type BulkRow,
  type BulkRunResult,
} from "./bulk-actions";
import { useCurrentUser, useIsAdmin } from "./use-current-user";
import type { Transition } from "~/utils/workflow";

/**
 * Row-selection state for a log table. Holds the set of selected ids; the page
 * derives "all visible selected" etc. from the currently-filtered rows so a
 * filter change naturally narrows what bulk actions act on (stale ids in the
 * set are simply never matched).
 */
export function useBulkSelection() {
  const [selected, setSelected] = React.useState<Set<number>>(
    () => new Set(),
  );

  const toggle = React.useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  /** Replace the selection with exactly `ids` (header select-all over the
   *  currently-visible rows), or clear when already all-selected. */
  const selectAll = React.useCallback(
    (ids: number[]) => setSelected(new Set(ids)),
    [],
  );

  return { selected, toggle, clear, selectAll };
}

function summarize(verb: string, r: BulkRunResult): string {
  if (r.failed === 0) return `${verb} ${r.ok} item${r.ok === 1 ? "" : "s"}.`;
  return `${verb} ${r.ok}, ${r.failed} skipped${
    r.firstError ? ` — ${r.firstError}` : ""
  }.`;
}

/**
 * Drives bulk transition + delete from a log page. Loops the page's existing
 * per-record server fns (so all the role / originator / audit / email rules
 * apply unchanged), confirms destructive actions, surfaces a one-line result,
 * invalidates caches, and clears the selection on a clean run.
 */
export function useBulkRunner(opts: {
  /** Singular noun for confirms/results, e.g. "CVR". */
  entityNoun: string;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  invalidate: () => void;
  clearSelection: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const plural = (n: number) =>
    `${n} ${opts.entityNoun}${n === 1 ? "" : "s"}`;

  async function runAction(
    action: string,
    ids: number[],
    destructive: boolean,
  ): Promise<void> {
    if (ids.length === 0) return;
    if (destructive && !confirm(`${action} ${plural(ids.length)}?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await runBulk(ids, (id) => opts.onTransition({ id, action }));
      setResult(summarize(`${action} —`, r));
      opts.invalidate();
      if (r.failed === 0) opts.clearSelection();
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${plural(ids.length)}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await runBulk(ids, (id) => opts.onDelete(id));
      setResult(summarize("Deleted", r));
      opts.invalidate();
      if (r.failed === 0) opts.clearSelection();
    } finally {
      setBusy(false);
    }
  }

  return { busy, result, runAction, runDelete };
}

/** Props the log table needs to render the selection column. Spread straight
 *  into the `*Table` component. */
export type BulkTableProps = {
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (next: boolean) => void;
  allSelected: boolean;
  someSelected: boolean;
};

/** Props for `<BulkActionBar>`. Spread straight into it. */
export type BulkBarProps<S extends string> = {
  count: number;
  actions: BulkActionGroup<S>[];
  onRunAction: (action: string, ids: number[], destructive: boolean) => void;
  deleteIds: number[] | undefined;
  onDelete: ((ids: number[]) => void) | undefined;
  onClear: () => void;
  busy: boolean;
  result: string | null;
};

/**
 * One-stop bulk wiring for a log page. Composes selection state, the
 * actor-aware action derivation, and the bulk runner into the two prop
 * bundles a page actually needs — `bar` (spread into `<BulkActionBar>`) and
 * `table` (spread into the page's `*Table`). Delete is admin-gated here so
 * pages don't each re-derive it.
 *
 * `rows` is the currently-filtered list; bulk actions and select-all operate
 * over exactly what's visible.
 */
export function useBulkActions<S extends string>(opts: {
  rows: BulkRow[];
  transitions: Record<S, Transition<S>[]>;
  /** Singular noun for confirms/results, e.g. "CVR". */
  entityNoun: string;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  invalidate: () => void;
}): { bar: BulkBarProps<S>; table: BulkTableProps } {
  const { rows, transitions, entityNoun, onTransition, onDelete, invalidate } =
    opts;
  const { selected, toggle, clear, selectAll } = useBulkSelection();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = useIsAdmin();

  const selectedVisible = React.useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const visibleIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected =
    visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const someSelected = selectedVisible.length > 0 && !allSelected;

  const actions = React.useMemo(
    () =>
      currentUser
        ? bulkActionsForSelection(transitions, selectedVisible, currentUser)
        : [],
    [transitions, selectedVisible, currentUser],
  );

  const runner = useBulkRunner({
    entityNoun,
    onTransition,
    onDelete,
    invalidate,
    clearSelection: clear,
  });

  return {
    bar: {
      count: selectedVisible.length,
      actions,
      onRunAction: runner.runAction,
      deleteIds: isAdmin ? selectedVisible.map((r) => r.id) : undefined,
      onDelete: isAdmin ? runner.runDelete : undefined,
      onClear: clear,
      busy: runner.busy,
      result: runner.result,
    },
    table: {
      selected,
      onToggle: toggle,
      onToggleAll: (next) => (next ? selectAll(visibleIds) : clear()),
      allSelected,
      someSelected,
    },
  };
}

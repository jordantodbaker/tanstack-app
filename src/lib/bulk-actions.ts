import { availableTransitions, type Transition } from "~/utils/workflow";
import type { UserRole } from "~/utils/users";

/**
 * Client-side bulk-action helpers for the log views. Bulk operations reuse the
 * per-record server fns (transition / delete) — looping them client-side keeps
 * one authorization + audit + email-emit path instead of a parallel "bulk"
 * server surface that could drift from the single-record rules.
 */

/** Minimum a list row must expose to participate in bulk workflow actions. */
export type BulkRow = {
  id: number;
  status: string;
  createdById: number | null;
};

/** One bulk action offered for the current selection, plus the subset of
 *  selected ids it actually applies to. */
export type BulkActionGroup<S extends string> = {
  action: string;
  to: S;
  /** VOID / REJECTED transitions — the UI confirms these before running. */
  destructive: boolean;
  /** Selected ids for which this action is currently a legal transition. */
  ids: number[];
};

/**
 * Distinct workflow actions available across a selection. An action is offered
 * when it's a legal transition for the actor on AT LEAST ONE selected row;
 * `ids` carries exactly the rows it applies to, so a mixed-status selection
 * (e.g. some PENDING_APPROVAL, some APPROVED) still surfaces "Approve" for the
 * subset it fits and "Void" for all of them. Rows where the action isn't legal
 * are simply left out of that action's `ids` — never silently transitioned.
 *
 * Pure: same source of truth (`availableTransitions`) the dialog and server
 * use, so bulk can never offer something a single-record action wouldn't.
 */
export function bulkActionsForSelection<S extends string>(
  map: Record<S, Transition<S>[]>,
  rows: BulkRow[],
  actor: { id: number; role: UserRole },
): BulkActionGroup<S>[] {
  const byAction = new Map<string, { to: S; ids: number[] }>();
  for (const row of rows) {
    const isOriginator =
      row.createdById !== null && row.createdById === actor.id;
    for (const t of availableTransitions(
      map,
      row.status as S,
      actor.role,
      isOriginator,
    )) {
      const entry = byAction.get(t.action) ?? { to: t.to, ids: [] };
      entry.ids.push(row.id);
      byAction.set(t.action, entry);
    }
  }
  return [...byAction.entries()].map(([action, { to, ids }]) => ({
    action,
    to,
    ids,
    destructive: to === "VOID" || to === "REJECTED",
  }));
}

export type BulkRunResult = {
  ok: number;
  failed: number;
  /** First error message, surfaced when one or more items fail. */
  firstError: string | null;
};

/**
 * Run `fn` over every id with bounded concurrency, tolerating per-item
 * failures. A rejected item (e.g. another user already advanced its status,
 * so the transition is no longer legal) is counted in `failed` rather than
 * aborting the batch — partial success is the expected outcome for a mixed
 * selection.
 */
export async function runBulk(
  ids: number[],
  fn: (id: number) => Promise<unknown>,
  concurrency = 4,
): Promise<BulkRunResult> {
  let ok = 0;
  let failed = 0;
  let firstError: string | null = null;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await fn(id);
        ok++;
      } catch (err) {
        failed++;
        if (firstError === null) {
          firstError = err instanceof Error ? err.message : String(err);
        }
      }
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), ids.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return { ok, failed, firstError };
}

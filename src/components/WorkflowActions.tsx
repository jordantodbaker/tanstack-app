import * as React from "react";
import { Button } from "~/components/ui/button";

/**
 * Workflow-actions panel rendered inside CVR and FCO edit dialogs. Owns the
 * confirm-for-destructive flow, busy-state, and the alert-on-failure UX so
 * both dialogs stay in sync.
 *
 * Generic over the status string so each caller can pass its own typed
 * transitions; only `t.action` and `t.to` are used at render time, so the
 * full `Transition` shape from `~/utils/workflow` flows through unchanged.
 */
export function WorkflowActions<S extends string>({
  transitions,
  busy,
  setBusy,
  onTransition,
  entityId,
  entityNoun,
  onSuccess,
}: {
  transitions: { action: string; to: S }[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** Server call. Returns when the transition is persisted. */
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  entityId: number;
  /** Used in confirm prompts and alerts, e.g. "CVR" or "FCO". */
  entityNoun: string;
  /** Fires after a successful transition — typical caller closes the dialog. */
  onSuccess: () => void;
}) {
  async function run(action: string, destructive: boolean) {
    if (destructive && !confirm(`${action} this ${entityNoun}?`)) return;
    setBusy(true);
    try {
      await onTransition({ id: entityId, action });
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Could not ${action.toLowerCase()}: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Workflow Actions
      </div>
      {transitions.length === 0 ? (
        <p className="text-xs text-slate-500">
          No actions available from this status for your role.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => {
            const destructive = t.to === "VOID" || t.to === "REJECTED";
            return (
              <Button
                key={t.action}
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(t.action, destructive)}
                className={
                  destructive
                    ? "text-red-700 hover:bg-red-50 hover:text-red-800"
                    : undefined
                }
              >
                {t.action}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

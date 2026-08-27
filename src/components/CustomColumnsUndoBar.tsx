import { Undo2, X } from "lucide-react";
import { useCustomColumns } from "~/lib/custom-columns-context";

/**
 * "Removed X — Undo", shown in the sheet toolbar after a column is removed.
 *
 * It lives in the toolbar rather than beside whatever issued the removal
 * because removing from a column's own header destroys that header: the undo
 * has to outlive the control that triggered it. The toolbar is also where the
 * `+ Column` popover sits, so both paths surface the same affordance in the
 * same place.
 *
 * Renders nothing when there is nothing to undo, so it costs no layout.
 */
export function CustomColumnsUndoBar() {
  const { undoable, undo, dismissUndo, busy } = useCustomColumns();
  if (!undoable) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs">
      <span className="text-slate-600">
        Removed <span className="font-medium text-slate-800">{undoable.label}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={undo}
        className="inline-flex items-center gap-1 font-medium text-slate-700 hover:underline disabled:opacity-50"
      >
        <Undo2 className="size-3" />
        Undo
      </button>
      <button
        type="button"
        title="Dismiss"
        onClick={dismissUndo}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

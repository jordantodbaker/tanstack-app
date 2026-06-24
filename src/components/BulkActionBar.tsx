import * as React from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Th } from "~/components/ui/list-page";
import type { BulkActionGroup } from "~/lib/bulk-actions";

/**
 * Selection + bulk-action UI shared by the log views (CVR / FCO / RFI / Trend
 * / PCO). `BulkHeaderCell` / `BulkRowCell` add the checkbox column; the
 * body-row checkbox stops click propagation so ticking it never opens the
 * row's edit dialog. `BulkActionBar` renders the floating action toolbar shown
 * while a selection exists.
 */

/** Header select-all cell. Tri-state: checked when all visible rows are
 *  selected, indeterminate on a partial selection. */
export function BulkHeaderCell({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (next: boolean) => void;
}) {
  return (
    <Th className="w-8">
      <Checkbox
        aria-label={allSelected ? "Deselect all" : "Select all"}
        checked={allSelected ? true : someSelected ? "indeterminate" : false}
        onCheckedChange={(v) => onToggleAll(v === true)}
      />
    </Th>
  );
}

/** Body-row checkbox cell. Lives inside a `<tr>` that is itself a dialog
 *  trigger, so it swallows pointer/click events to avoid opening the dialog. */
export function BulkRowCell({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <td
      className="px-3 py-2 border-b border-slate-100"
      onClick={stop}
      onPointerDown={stop}
    >
      <Checkbox
        aria-label={checked ? "Deselect row" : "Select row"}
        checked={checked}
        onCheckedChange={() => onToggle()}
      />
    </td>
  );
}

export function BulkActionBar<S extends string>({
  count,
  actions,
  onRunAction,
  deleteIds,
  onDelete,
  onClear,
  busy,
  result,
}: {
  /** Number of currently-selected (visible) rows. */
  count: number;
  actions: BulkActionGroup<S>[];
  onRunAction: (action: string, ids: number[], destructive: boolean) => void;
  /** Ids eligible for bulk delete; pass with `onDelete` to show the button
   *  (admin-gated by the caller). Omit to hide delete entirely. */
  deleteIds?: number[];
  onDelete?: (ids: number[]) => void;
  onClear: () => void;
  busy: boolean;
  result: string | null;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 shadow-sm">
      <span className="text-sm font-semibold text-slate-700">
        {count} selected
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.map((a) => (
          <Button
            key={a.action}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onRunAction(a.action, a.ids, a.destructive)}
            className={
              a.destructive
                ? "text-red-700 hover:bg-red-50 hover:text-red-800"
                : undefined
            }
          >
            {a.action} ({a.ids.length})
          </Button>
        ))}
        {onDelete && deleteIds && deleteIds.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onDelete(deleteIds)}
            className="text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            Delete ({deleteIds.length})
          </Button>
        )}
      </div>
      {result && (
        <span className="text-xs text-slate-600">{result}</span>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={onClear}
        className="ml-auto text-slate-500"
      >
        Clear
      </Button>
    </div>
  );
}

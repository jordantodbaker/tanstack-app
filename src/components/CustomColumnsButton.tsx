import * as React from "react";
import { Plus } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { CUSTOM_FIELD_LABEL_MAX } from "~/utils/customFields";
import { CUSTOM_FIELD_SLOT_COUNT } from "~/lib/fef-helpers";
import { useCustomColumns } from "~/lib/custom-columns-context";

/**
 * Add a user-defined take-off column, and see which ones this sheet has.
 *
 * Adding lives here because it belongs to the sheet, not to any one column —
 * there is no column to hang it off yet. Managing an EXISTING column (rename,
 * reorder, clear, remove) is on that column's own header instead: people go
 * looking for "get rid of this column" at the column, and a popover full of
 * icon buttons is not where they look. This list stays as an overview and as
 * the way to reach a column that is scrolled out of view.
 */
export function CustomColumnsButton({ discipline }: { discipline: string }) {
  const { projectId } = useSelectedProject();
  const { defs, canEdit, busy, error, atCapacity, addPending, add } =
    useCustomColumns();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");

  React.useEffect(() => {
    if (!open) setLabel("");
  }, [open]);

  if (projectId === null || !canEdit) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Add or manage custom columns for this sheet"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-dashed border-slate-400 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
        >
          <Plus className="size-3" />
          Column
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Custom columns
            </p>
            <p className="text-xs text-slate-500">
              Your own fields for this discipline&apos;s take off. They apply to
              every revision of this project.
            </p>
          </div>

          {defs.length > 0 && (
            <div className="space-y-1">
              <ul className="space-y-0.5">
                {defs.map((d) => (
                  <li
                    key={d.id}
                    className="truncate rounded px-1.5 py-1 text-sm text-slate-700"
                  >
                    {d.label}
                  </li>
                ))}
              </ul>
              {/* Says where the controls are rather than duplicating them: two
                  menus for the same actions is how the first version ended up
                  with four unlabelled glyphs nobody found. */}
              <p className="px-1.5 text-xs text-slate-500">
                Rename, reorder or remove a column from the ⋮ on its heading in
                the sheet.
              </p>
            </div>
          )}

          <form
            className="flex items-center gap-1 border-t border-slate-200 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const next = label.trim();
              if (next) {
                add(next);
                setLabel("");
              }
            }}
          >
            <Input
              value={label}
              maxLength={CUSTOM_FIELD_LABEL_MAX}
              disabled={atCapacity || busy}
              placeholder={atCapacity ? "All columns used" : "Column name"}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={atCapacity || busy || label.trim() === ""}
            >
              {addPending ? "Adding…" : "Add"}
            </Button>
          </form>

          {atCapacity && (
            <p className="text-xs text-slate-500">
              This discipline is using all {CUSTOM_FIELD_SLOT_COUNT} custom
              columns. Remove one to add another.
            </p>
          )}

          {error != null && (
            <p className="text-xs text-red-600">
              {error instanceof Error
                ? error.message
                : "Could not update columns."}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { useHasRole } from "~/lib/use-current-user";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  CUSTOM_FIELD_LABEL_MAX,
  addCustomFieldDef,
  customFieldDefsQueryOptions,
  invalidateCustomFieldQueries,
  clearCustomFieldData,
  removeCustomFieldDef,
  renameCustomFieldDef,
  reorderCustomFieldDefs,
  type CustomFieldDefItem,
} from "~/utils/customFields";
import { CUSTOM_FIELD_SLOT_COUNT, EMPTY_ARRAY } from "~/lib/fef-helpers";
import { moveInOrder } from "~/lib/custom-fields";

/**
 * Add and manage this discipline's user-defined take-off columns.
 *
 * One popover rather than an add button plus a caret menu on each column
 * header: the columns are built two levels up (in `FefTable` / `PipingTable`),
 * so a header menu would mean threading mutation callbacks through the column
 * definitions in both. Managing them in one list is also easier to scan once
 * there are several, and keeps the grid header free of controls that would
 * scroll away horizontally.
 */
export function CustomColumnsButton({ discipline }: { discipline: string }) {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<number | null>(null);
  const [renameLabel, setRenameLabel] = React.useState("");

  // Defining columns changes the sheet for everyone on the project; the server
  // enforces this too, so this only hides an affordance that would be refused.
  const canEdit = useHasRole("APPROVER");

  const { data: defs = EMPTY_ARRAY as CustomFieldDefItem[] } = useQuery(
    customFieldDefsQueryOptions(projectId, discipline),
  );

  const settle = () =>
    invalidateCustomFieldQueries(queryClient, projectId, discipline);

  const add = useMutation({
    mutationFn: () =>
      addCustomFieldDef({
        data: { projectId: projectId!, discipline, label },
      }),
    onSuccess: () => {
      setLabel("");
      settle();
    },
  });
  const rename = useMutation({
    mutationFn: (input: { id: number; label: string }) =>
      renameCustomFieldDef({ data: input }),
    onSuccess: () => {
      setRenamingId(null);
      settle();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => removeCustomFieldDef({ data: { id } }),
    onSuccess: settle,
  });
  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) =>
      reorderCustomFieldDefs({
        data: { projectId: projectId!, discipline, orderedIds },
      }),
    onSuccess: settle,
  });
  const clearData = useMutation({
    mutationFn: (id: number) => clearCustomFieldData({ data: { id } }),
    onSuccess: () => {
      setRenamingId(null);
      settle();
    },
  });

  /** Nudge a column one place left or right in the sheet. */
  const move = (id: number, delta: -1 | 1) => {
    const ids = defs.map((d) => d.id);
    const next = moveInOrder(ids, id, delta);
    // `moveInOrder` clamps, so an end-of-list nudge produces the same order —
    // don't spend a write on it.
    if (next.every((v, i) => v === ids[i])) return;
    reorder.mutate(next);
  };

  const atCapacity = defs.length >= CUSTOM_FIELD_SLOT_COUNT;
  const busy =
    add.isPending ||
    rename.isPending ||
    remove.isPending ||
    reorder.isPending ||
    clearData.isPending;
  const error =
    add.error ?? rename.error ?? remove.error ?? reorder.error ?? clearData.error;

  React.useEffect(() => {
    if (!open) {
      setLabel("");
      setRenamingId(null);
    }
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
            <ul className="space-y-1">
              {defs.map((d, i) => (
                <li key={d.id}>
                  {renamingId === d.id ? (
                    <div className="space-y-1">
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          rename.mutate({ id: d.id, label: renameLabel });
                        }}
                      >
                        <Input
                          autoFocus
                          value={renameLabel}
                          maxLength={CUSTOM_FIELD_LABEL_MAX}
                          onChange={(e) => setRenameLabel(e.target.value)}
                          className="h-7 text-sm"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={busy || renameLabel.trim() === ""}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setRenamingId(null)}
                        >
                          Cancel
                        </Button>
                      </form>
                      {/* Clearing lives here rather than on the resting row: it
                          belongs to "I am working on this column", and keeps the
                          row from growing a fifth control. */}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Clear everything typed into “${d.label}” on every ${discipline} take-off row of this project?

` +
                                "The column stays; only its values go. This can't be undone.",
                            )
                          ) {
                            clearData.mutate(d.id);
                          }
                        }}
                        className="px-1.5 text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {clearData.isPending
                          ? "Clearing…"
                          : "Clear this column's data"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-slate-50">
                      <span className="flex-1 truncate text-sm text-slate-700">
                        {d.label}
                      </span>
                      <button
                        type="button"
                        title="Move left"
                        disabled={busy || i === 0}
                        onClick={() => move(d.id, -1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move right"
                        disabled={busy || i === defs.length - 1}
                        onClick={() => move(d.id, 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title={`Rename “${d.label}”`}
                        disabled={busy}
                        onClick={() => {
                          setRenamingId(d.id);
                          setRenameLabel(d.label);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title={`Remove “${d.label}”`}
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove the “${d.label}” column from this sheet?\n\n` +
                                `What people typed into it is kept, so re-adding the ` +
                                `column brings it back — until the slot is given to a ` +
                                `new column, which starts empty.`,
                            )
                          ) {
                            remove.mutate(d.id);
                          }
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex items-center gap-1 border-t border-slate-200 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
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
              {add.isPending ? "Adding…" : "Add"}
            </Button>
          </form>

          {atCapacity && (
            <p className="text-xs text-slate-500">
              This discipline is using all {CUSTOM_FIELD_SLOT_COUNT} custom
              columns. Remove one to add another.
            </p>
          )}

          {error && (
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

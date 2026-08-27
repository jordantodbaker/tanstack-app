import * as React from "react";
import { ChevronDown, ChevronUp, Eraser, MoreVertical, Pencil, X } from "lucide-react";
import { useCustomColumns } from "~/lib/custom-columns-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { CUSTOM_FIELD_LABEL_MAX } from "~/utils/customFields";

/**
 * Header for a user-defined column: its name, plus the actions for it.
 *
 * The actions live here because this is where people look for them. The
 * `+ Column` popover manages the whole set and is the only place to ADD one,
 * but "get rid of this column" is a thought you have while looking at the
 * column — not one that sends you hunting through a toolbar popover.
 *
 * Renaming happens inline rather than in a dialog: the header is already a
 * text-sized slot, so the input can sit exactly where the label was.
 *
 * Outside a `CustomColumnsProvider` this degrades to the plain label, which is
 * what the Field Estimate tab and any unwrapped table get.
 */
export function CustomColumnHeader({
  id,
  label,
}: {
  /** CustomFieldDef id. */
  id: number;
  label: string;
}) {
  const { defs, canEdit, busy, remove, rename, clearData, move } =
    useCustomColumns();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(label);

  const index = defs.findIndex((d) => d.id === id);
  const discipline = defs[index]?.discipline ?? "";

  if (!canEdit || index === -1) {
    return <span className="truncate">{label}</span>;
  }

  if (editing) {
    return (
      <form
        // The header sits inside a sortable/resizable cell; keep its handlers
        // from treating a click in the input as a sort or a drag.
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim();
          if (next && next !== label) rename(id, next);
          setEditing(false);
        }}
        className="flex items-center gap-1"
      >
        <input
          autoFocus
          value={draft}
          maxLength={CUSTOM_FIELD_LABEL_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(label);
              setEditing(false);
            }
          }}
          className="w-full min-w-0 rounded border border-slate-300 px-1 py-0.5 text-xs font-normal text-slate-800 outline-none focus:border-slate-500"
        />
      </form>
    );
  }

  return (
    <span className="flex w-full items-center gap-1">
      <span className="flex-1 truncate">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Actions for “${label}”`}
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              setDraft(label);
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => move(id, -1)}>
            <ChevronUp className="size-3.5" />
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === defs.length - 1}
            onSelect={() => move(id, 1)}
          >
            <ChevronDown className="size-3.5" />
            Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={() => {
              if (
                confirm(
                  `Clear everything typed into “${label}” on every ${discipline} take-off row of this project?\n\n` +
                    "The column stays; only its values go. This can't be undone.",
                )
              ) {
                clearData(id);
              }
            }}
          >
            <Eraser className="size-3.5" />
            Clear column data…
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onSelect={() => {
              if (
                confirm(
                  `Remove the “${label}” column from this sheet?\n\n` +
                    `What people typed into it is kept, so this can be undone — ` +
                    `until the slot is given to a new column, which starts empty.`,
                )
              ) {
                remove(id);
              }
            }}
          >
            <X className="size-3.5" />
            Remove column…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Labeled } from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import { disciplines } from "~/config/disciplines";
import type { RoleAdminItem, UpsertRoleInput } from "~/utils/roles";

// Real construction disciplines — anything with a CBS L1-code mapping. Skips
// nav-only sections like Setup / Summary / Subcontracts so the checkbox list
// matches what a role could conceivably be assigned to on a Take Off sheet.
const DISCIPLINE_CHECKBOX_OPTIONS = disciplines.filter(
  (d) => d.l1Codes && d.l1Codes.length > 0,
);

type FormState = UpsertRoleInput;

export function RoleDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: RoleAdminItem;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<RoleAdminItem, FormState>({
      initial,
      blank: () => ({ name: "", disciplines: [] }),
      fromItem: (r) => ({
        id: r.id,
        name: r.name,
        disciplines: r.disciplines,
      }),
      onSubmit,
      onDelete,
      deleteConfirm: (r) =>
        `Delete role "${r.name}"? ` +
        (r.rateCount > 0
          ? `This also removes ${r.rateCount} composite rate row${r.rateCount === 1 ? "" : "s"}. `
          : "") +
        `Existing Take Off rows that reference this role will keep the name as a stale value. This cannot be undone.`,
    });

  const toggleDiscipline = (id: string) => {
    const next = form.disciplines.includes(id)
      ? form.disciplines.filter((d) => d !== id)
      : [...form.disciplines, id];
    update("disciplines", next);
  };

  const allChecked =
    form.disciplines.length === DISCIPLINE_CHECKBOX_OPTIONS.length;

  const toggleAll = () => {
    update(
      "disciplines",
      allChecked ? [] : DISCIPLINE_CHECKBOX_OPTIONS.map((d) => d.id),
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,640px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Role" : "New Role"}
              </h2>
              <p className="text-xs text-slate-500">
                Construction discipline role shown in the Take Off "Role"
                dropdown
              </p>
            </div>
            {initial && onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={busy}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>

          <Labeled label="Name" help="Unique role name, e.g. Pipefitter">
            <Input
              value={form.name}
              placeholder="Pipefitter"
              onChange={(e) => update("name", e.target.value)}
            />
          </Labeled>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-medium text-slate-700">
                Disciplines
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-blue-700 hover:underline"
              >
                {allChecked ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-slate-200 bg-white p-3">
              {DISCIPLINE_CHECKBOX_OPTIONS.map((d) => {
                const checked = form.disciplines.includes(d.id);
                const Icon = d.icon;
                return (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDiscipline(d.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <Icon className="size-3.5 text-slate-400 shrink-0" />
                    <span>{d.label}</span>
                  </label>
                );
              })}
            </div>
            <span className="mt-0.5 block text-xs text-slate-400">
              The role only appears in the Take Off "Role" dropdown for the
              disciplines checked here.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !form.name.trim()}
            >
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

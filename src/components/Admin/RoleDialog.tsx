import React from "react";
import { Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { schedulesQueryOptions } from "~/utils/schedules";
import type { RoleAdminItem, UpsertRoleInput } from "~/utils/roles";

// Real construction disciplines — anything with a CBS L1-code mapping. Skips
// nav-only sections like Setup / Summary / Subcontracts so the checkbox list
// matches what a role could conceivably be assigned to on a Take Off sheet.
const DISCIPLINE_CHECKBOX_OPTIONS = disciplines.filter(
  (d) => d.l1Codes && d.l1Codes.length > 0,
);

// Rates are edited as strings keyed by schedule name so a half-typed value
// doesn't snap to NaN mid-keystroke; parsed back to numbers on submit.
type FormState = {
  id?: number;
  name: string;
  disciplines: string[];
  rates: Record<string, string>;
};

function toForm(item?: RoleAdminItem): FormState {
  if (!item) return { name: "", disciplines: [], rates: {} };
  const rates: Record<string, string> = {};
  for (const r of item.rates) rates[r.schedule] = String(r.rate);
  return {
    id: item.id,
    name: item.name,
    disciplines: item.disciplines,
    rates,
  };
}

function toUpsert(form: FormState): UpsertRoleInput {
  const rates = Object.entries(form.rates)
    .map(([schedule, raw]) => ({ schedule, rate: parseFloat(raw) }))
    .filter((r) => r.schedule !== "" && Number.isFinite(r.rate));
  return {
    id: form.id,
    name: form.name,
    disciplines: form.disciplines,
    rates,
  };
}

export function RoleDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: RoleAdminItem;
  onSubmit: (form: UpsertRoleInput) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { data: schedules = [] } = useQuery(schedulesQueryOptions());
  const { open, setOpen, form, setForm, busy, update, handleSubmit, handleDelete } =
    useFormDialog<RoleAdminItem, FormState>({
      initial,
      blank: () => toForm(),
      fromItem: (r) => toForm(r),
      onSubmit: (f) => onSubmit(toUpsert(f)),
      onDelete,
      deleteConfirm: (r) =>
        `Delete role "${r.name}"? ` +
        (r.rates.length > 0
          ? `This also removes ${r.rates.length} rate row${r.rates.length === 1 ? "" : "s"}. `
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

  const setRate = (schedule: string, value: string) =>
    setForm((f) => ({ ...f, rates: { ...f.rates, [schedule]: value } }));

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

          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1">
              Labor Rates ($/hr by schedule)
            </span>
            {schedules.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No schedules defined yet. Add them under Admin → Schedules first,
                then set a rate for each here.
              </p>
            ) : (
              <div className="rounded-md border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 border-b border-slate-200">
                        Schedule
                      </th>
                      <th className="px-3 py-2 border-b border-slate-200 w-40">
                        Rate ($/hr)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-1.5 border-b border-slate-100 font-mono text-xs text-slate-700">
                          {s.name}
                        </td>
                        <td className="px-3 py-1.5 border-b border-slate-100">
                          <Input
                            value={form.rates[s.name] ?? ""}
                            placeholder="—"
                            inputMode="decimal"
                            onChange={(e) => setRate(s.name, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <span className="mt-0.5 block text-xs text-slate-400">
              Leave a schedule blank to give this role no rate for it. Crew mixes
              read these rates at their chosen schedule.
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

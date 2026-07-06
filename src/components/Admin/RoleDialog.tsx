import React from "react";
import { Plus, Trash2, X } from "lucide-react";
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
import type { RoleAdminItem, RoleRateAdmin, UpsertRoleInput } from "~/utils/roles";

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
  // Drop empty/blank rate rows before the parent's `onSubmit` runs them
  // through the zod validator — the table can hold an in-progress "" row
  // the user added but never filled in, and we don't want that as an error.
  const wrappedOnSubmit = React.useCallback(
    (form: FormState) =>
      onSubmit({
        ...form,
        rates: form.rates
          .map((r) => ({ schedule: r.schedule.trim(), rate: r.rate }))
          .filter((r) => r.schedule !== ""),
      }),
    [onSubmit],
  );

  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<RoleAdminItem, FormState>({
      initial,
      blank: () => ({ name: "", disciplines: [], rates: [] }),
      fromItem: (r) => ({
        id: r.id,
        name: r.name,
        disciplines: r.disciplines,
        rates: r.rates.map((rate) => ({
          schedule: rate.schedule,
          rate: rate.rate,
        })),
      }),
      onSubmit: wrappedOnSubmit,
      onDelete,
      deleteConfirm: (r) =>
        `Delete role "${r.name}"? ` +
        (r.rateCount > 0
          ? `This also removes ${r.rateCount} composite rate row${r.rateCount === 1 ? "" : "s"}. `
          : "") +
        `Existing Take Off rows that reference this role will keep the name as a stale value. This cannot be undone.`,
    });

  /** Editing helpers for the rates table. Schedule is uniqued at submit
   *  time by the zod validator; here we just shuttle local state. */
  const setRate = (index: number, patch: Partial<RoleRateAdmin>) => {
    update(
      "rates",
      form.rates.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };
  const addRate = () => {
    update("rates", [...form.rates, { schedule: "", rate: 0 }]);
  };
  const removeRate = (index: number) => {
    update(
      "rates",
      form.rates.filter((_, i) => i !== index),
    );
  };

  // Duplicate-schedule warning — same rule the server-side validator enforces.
  // Surfaced inline so the user can fix it before clicking Save and seeing a
  // generic server error.
  const duplicateSchedules = React.useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const r of form.rates) {
      const s = r.schedule.trim();
      if (!s) continue;
      if (seen.has(s)) dupes.add(s);
      seen.add(s);
    }
    return dupes;
  }, [form.rates]);
  const hasDuplicates = duplicateSchedules.size > 0;

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

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-medium text-slate-700">
                Labor rates
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRate}
                className="text-xs"
              >
                <Plus className="size-3 mr-1" />
                Add rate
              </Button>
            </div>
            <div className="rounded-md border border-slate-200 bg-white">
              {form.rates.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-500 text-center">
                  No rates yet. Add a rate per schedule (e.g. ST, OT, DT) so
                  this role can be selected on a Take Off row.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="px-3 py-1.5 text-left">Schedule</th>
                      <th className="px-3 py-1.5 text-right">Rate ($)</th>
                      <th className="px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.rates.map((rate, i) => {
                      const trimmed = rate.schedule.trim();
                      const isDuplicate =
                        trimmed !== "" && duplicateSchedules.has(trimmed);
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-1">
                            <Input
                              value={rate.schedule}
                              placeholder="ST"
                              onChange={(e) =>
                                setRate(i, { schedule: e.target.value })
                              }
                              className={
                                isDuplicate
                                  ? "border-red-300 focus-visible:ring-red-300"
                                  : ""
                              }
                              aria-invalid={isDuplicate || undefined}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rate.rate}
                              onChange={(e) =>
                                setRate(i, {
                                  rate: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1 w-10 text-center">
                            <button
                              type="button"
                              onClick={() => removeRate(i)}
                              aria-label={`Remove ${rate.schedule || "rate"}`}
                              className="text-slate-400 hover:text-red-600 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-red-50"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {hasDuplicates ? (
              <span className="mt-0.5 block text-xs text-red-600">
                Duplicate schedule
                {duplicateSchedules.size === 1 ? "" : "s"}:{" "}
                {Array.from(duplicateSchedules).join(", ")}. Each schedule
                must appear at most once per role.
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-slate-400">
                The Take Off sheet looks up the rate by (Role, Schedule). Empty
                rows are dropped on save; common schedules are ST, OT, DT.
              </span>
            )}
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
              disabled={busy || !form.name.trim() || hasDuplicates}
            >
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

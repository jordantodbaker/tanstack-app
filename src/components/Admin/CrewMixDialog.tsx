import React from "react";
import { Trash2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Labeled } from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import { rolesAdminQueryOptions } from "~/utils/roles";
import { schedulesQueryOptions } from "~/utils/schedules";
import { crewMixAverageRate, type RoleRateRow } from "~/lib/crew-mix-rate";
import type {
  CrewMixAdminItem,
  UpsertCrewMixInput,
} from "~/utils/crewMixes";

// Counts are edited as strings so a half-typed value doesn't snap to NaN;
// parsed back on submit. `roleId` of 0 means "not chosen yet".
type MemberDraft = { roleId: number; count: string };
type FormState = {
  id?: number;
  name: string;
  description: string;
  schedule: string;
  members: MemberDraft[];
};

function toForm(item?: CrewMixAdminItem): FormState {
  if (!item) {
    return {
      name: "",
      description: "",
      schedule: "",
      members: [{ roleId: 0, count: "1" }],
    };
  }
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    schedule: item.schedule,
    members:
      item.members.length === 0
        ? [{ roleId: 0, count: "1" }]
        : item.members.map((m) => ({ roleId: m.roleId, count: String(m.count) })),
  };
}

function toUpsert(form: FormState): UpsertCrewMixInput {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    schedule: form.schedule,
    members: form.members
      .map((m) => ({ roleId: m.roleId, count: parseInt(m.count, 10) }))
      .filter((m) => m.roleId > 0 && Number.isFinite(m.count) && m.count > 0),
  };
}

/** Flatten the admin role list into the `{ roleName, schedule, rate }` rows the
 *  shared averaging helper expects. */
function toRoleRateRows(
  roles: { name: string; rates: { schedule: string; rate: number }[] }[],
): RoleRateRow[] {
  return roles.flatMap((r) =>
    r.rates.map((rt) => ({
      roleName: r.name,
      schedule: rt.schedule,
      rate: rt.rate,
    })),
  );
}

export function CrewMixDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  initial?: CrewMixAdminItem;
  onSubmit: (form: UpsertCrewMixInput) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { data: roles = [] } = useQuery(rolesAdminQueryOptions());
  const { data: schedules = [] } = useQuery(schedulesQueryOptions());

  const { open, setOpen, form, setForm, busy, update, handleSubmit, handleDelete } =
    useFormDialog<CrewMixAdminItem, FormState>({
      initial,
      blank: () => toForm(),
      fromItem: (i) => toForm(i),
      onSubmit: (f) => onSubmit(toUpsert(f)),
      onDelete,
      deleteConfirm: (m) =>
        `Delete crew mix "${m.name}"? Existing Take Off rows that used this mix will keep their snapshotted labor rate but lose the link. This cannot be undone.`,
    });

  const roleNameById = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const r of roles) m.set(r.id, r.name);
    return m;
  }, [roles]);

  const roleRateRows = React.useMemo(() => toRoleRateRows(roles), [roles]);

  const addMember = () =>
    setForm((f) => ({
      ...f,
      members: [...f.members, { roleId: 0, count: "1" }],
    }));

  const removeMember = (idx: number) =>
    setForm((f) => ({
      ...f,
      members:
        f.members.length === 1
          ? [{ roleId: 0, count: "1" }]
          : f.members.filter((_, i) => i !== idx),
    }));

  const updateMember = (idx: number, patch: Partial<MemberDraft>) =>
    setForm((f) => ({
      ...f,
      members: f.members.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));

  // Members resolved to { roleName, count } for the weighted-average preview.
  const previewMembers = form.members
    .map((m) => ({
      roleName: roleNameById.get(m.roleId),
      count: parseInt(m.count, 10),
    }))
    .filter(
      (m): m is { roleName: string; count: number } =>
        m.roleName !== undefined && Number.isFinite(m.count) && m.count > 0,
    );

  const avgRate = crewMixAverageRate(previewMembers, form.schedule, roleRateRows);

  const canSave =
    !busy &&
    form.name.trim() !== "" &&
    form.schedule !== "" &&
    previewMembers.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,640px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Crew Mix" : "New Crew Mix"}
              </h2>
              <p className="text-xs text-slate-500">
                Roles (with a head count each) plus one schedule. The Take Off's
                "Use Crew Mix" mode sets the row's labor rate to the head-count-
                weighted average of the roles' rates at that schedule.
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

          <Labeled label="Name" help="Unique crew mix name, e.g. Pipe Crew A">
            <Input
              value={form.name}
              placeholder="Pipe Crew A"
              onChange={(e) => update("name", e.target.value)}
            />
          </Labeled>

          <Labeled label="Description">
            <Textarea
              value={form.description}
              rows={2}
              placeholder="Composition or intent of this crew mix"
              onChange={(e) => update("description", e.target.value)}
            />
          </Labeled>

          <Labeled
            label="Schedule"
            help="Member roles' rates are read at this schedule"
          >
            {schedules.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No schedules defined yet. Add them under Admin → Schedules first.
              </p>
            ) : (
              <select
                value={form.schedule}
                onChange={(e) => update("schedule", e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                <option value="">— Select schedule —</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Labeled>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-medium text-slate-700">
                Roles
              </span>
              <span className="text-xs text-slate-500">
                Average rate:{" "}
                <span className="font-semibold text-slate-800">
                  {form.schedule === "" || avgRate === 0
                    ? "—"
                    : `$${avgRate.toFixed(2)}`}
                </span>
              </span>
            </div>
            {roles.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No roles defined yet. Add them under Admin → Roles first.
              </p>
            ) : (
              <div className="rounded-md border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 border-b border-slate-200">Role</th>
                      <th className="px-3 py-2 border-b border-slate-200 w-24">
                        Count
                      </th>
                      <th className="px-3 py-2 border-b border-slate-200 w-24">
                        Rate
                      </th>
                      <th className="px-3 py-2 border-b border-slate-200 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.members.map((m, idx) => {
                      const roleName = roleNameById.get(m.roleId);
                      const rate =
                        roleName === undefined
                          ? undefined
                          : roleRateRows.find(
                              (rr) =>
                                rr.roleName === roleName &&
                                rr.schedule === form.schedule,
                            )?.rate;
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-1.5 border-b border-slate-100">
                            <select
                              value={m.roleId}
                              onChange={(e) =>
                                updateMember(idx, {
                                  roleId: Number(e.target.value),
                                })
                              }
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                            >
                              <option value={0}>— Select role —</option>
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5 border-b border-slate-100">
                            <Input
                              value={m.count}
                              placeholder="1"
                              inputMode="numeric"
                              onChange={(e) =>
                                updateMember(idx, { count: e.target.value })
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5 border-b border-slate-100 text-xs text-slate-500">
                            {form.schedule === "" || m.roleId === 0
                              ? "—"
                              : rate !== undefined
                                ? `$${rate.toFixed(2)}`
                                : "no rate"}
                          </td>
                          <td className="px-3 py-1.5 border-b border-slate-100 text-center">
                            <button
                              type="button"
                              onClick={() => removeMember(idx)}
                              aria-label="Remove role"
                              className="text-slate-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              onClick={addMember}
              disabled={roles.length === 0}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
            >
              <Plus size={12} />
              Add role
            </button>
            <span className="mt-0.5 block text-xs text-slate-400">
              Add the same role more than once by giving it a higher count. Roles
              with no rate at the chosen schedule are excluded from the average.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={!canSave}>
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

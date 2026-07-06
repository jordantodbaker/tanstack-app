import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
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
import { crewMixAverageWage } from "~/utils/crewMixes";
import type {
  CrewMixAdminItem,
  UpsertCrewMixInput,
} from "~/utils/crewMixes";
import { rolesAdminQueryOptions } from "~/utils/roles";

// Members are edited as strings in the form so a half-typed wage doesn't
// snap to NaN/0 mid-keystroke. They're parsed back to numbers on submit.
type MemberDraft = { jobTitle: string; wage: string };
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
      members: [{ jobTitle: "", wage: "" }],
    };
  }
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    schedule: item.schedule,
    members:
      item.members.length === 0
        ? [{ jobTitle: "", wage: "" }]
        : item.members.map((m) => ({
            jobTitle: m.jobTitle,
            wage: String(m.wage),
          })),
  };
}

function toUpsert(form: FormState): UpsertCrewMixInput {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    schedule: form.schedule,
    members: form.members
      .map((m) => ({
        jobTitle: m.jobTitle.trim(),
        wage: parseFloat(m.wage),
      }))
      .filter((m) => m.jobTitle !== "" && Number.isFinite(m.wage)),
  };
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

  const addMember = () =>
    setForm((f) => ({
      ...f,
      members: [...f.members, { jobTitle: "", wage: "" }],
    }));

  const removeMember = (idx: number) =>
    setForm((f) => ({
      ...f,
      members:
        f.members.length === 1
          ? [{ jobTitle: "", wage: "" }]
          : f.members.filter((_, i) => i !== idx),
    }));

  const updateMember = (idx: number, patch: Partial<MemberDraft>) =>
    setForm((f) => ({
      ...f,
      members: f.members.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));

  // Roles drive the Job Title and Schedule dropdowns. Lazy-fetched on open
  // so opening the trigger row doesn't fire a request on every list render.
  const { data: roles = [] } = useQuery({
    ...rolesAdminQueryOptions(),
    enabled: open,
  });
  const roleByName = React.useMemo(
    () => new Map(roles.map((r) => [r.name, r])),
    [roles],
  );
  const roleNames = React.useMemo(
    () => roles.map((r) => r.name).sort(),
    [roles],
  );
  // Union of every schedule label that appears on any role's rate set.
  // The crew's schedule is shared across all members, so the choices here
  // are "anything any role supports" rather than the per-role intersection.
  const scheduleOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of roles) for (const rate of r.rates) s.add(rate.schedule);
    return Array.from(s).sort();
  }, [roles]);

  /** Looks up the rate for (role name, schedule). Returns undefined when
   *  either the role doesn't exist or it has no rate for that schedule —
   *  in either case the dialog leaves the wage field as the user set it. */
  const rateFor = React.useCallback(
    (jobTitle: string, schedule: string): number | undefined => {
      if (!jobTitle || !schedule) return undefined;
      const role = roleByName.get(jobTitle);
      return role?.rates.find((rt) => rt.schedule === schedule)?.rate;
    },
    [roleByName],
  );

  /** Apply a new schedule to the whole mix, refilling member wages where
   *  the new (role, schedule) pair maps to a known rate. Unknown pairs
   *  leave the wage as-is so a manually-typed override isn't clobbered
   *  just because the user picked a different schedule. */
  const setSchedule = (newSchedule: string) =>
    setForm((f) => ({
      ...f,
      schedule: newSchedule,
      members: f.members.map((m) => {
        const lookup = rateFor(m.jobTitle, newSchedule);
        return lookup === undefined ? m : { ...m, wage: String(lookup) };
      }),
    }));

  /** Pick a Role for a member. Auto-fills the wage from the current
   *  schedule when the pair maps to a known rate. */
  const setMemberRole = (idx: number, newRole: string) =>
    setForm((f) => {
      const lookup = rateFor(newRole, f.schedule);
      return {
        ...f,
        members: f.members.map((m, i) =>
          i === idx
            ? {
                jobTitle: newRole,
                wage: lookup === undefined ? m.wage : String(lookup),
              }
            : m,
        ),
      };
    });

  const validMembers = form.members
    .map((m) => ({ wage: parseFloat(m.wage), jobTitle: m.jobTitle.trim() }))
    .filter((m) => m.jobTitle !== "" && Number.isFinite(m.wage));

  const avgWage = crewMixAverageWage(validMembers);
  const canSave = !busy && form.name.trim() !== "" && validMembers.length > 0;

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
                A bundle of job titles + wages. The Take Off sheet's "Use Crew
                Mix" mode sets the row's labor rate to the average wage.
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
            help="Applies to every member. Changing it refills each member's wage from the matching role rate; manually-entered wages are preserved when the (role, schedule) pair doesn't have a configured rate."
          >
            <select
              value={form.schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
            >
              <option value="">— Not set —</option>
              {scheduleOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {/* Preserve a legacy schedule label even if no role currently
                  carries it, so editing an old mix doesn't drop the value. */}
              {form.schedule !== "" &&
                !scheduleOptions.includes(form.schedule) && (
                  <option value={form.schedule}>{form.schedule} (legacy)</option>
                )}
            </select>
          </Labeled>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-medium text-slate-700">
                Members
              </span>
              <span className="text-xs text-slate-500">
                Average wage:{" "}
                <span className="font-semibold text-slate-800">
                  ${avgWage.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="rounded-md border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 border-b border-slate-200">
                      Job Title
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 w-32">
                      Wage ($/hr)
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.members.map((m, idx) => {
                    // Show the existing jobTitle even if no Role of that name
                    // exists right now (legacy mix, or role got renamed). The
                    // legacy entry is added inline as a pinned option below
                    // the live role list, marked so the user notices.
                    const isLegacyTitle =
                      m.jobTitle !== "" && !roleByName.has(m.jobTitle);
                    return (
                    <tr key={idx}>
                      <td className="px-3 py-1.5 border-b border-slate-100">
                        <select
                          value={m.jobTitle}
                          onChange={(e) => setMemberRole(idx, e.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
                        >
                          <option value="">— Select role —</option>
                          {roleNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          {isLegacyTitle && (
                            <option value={m.jobTitle}>
                              {m.jobTitle} (legacy)
                            </option>
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 border-b border-slate-100">
                        <Input
                          value={m.wage}
                          placeholder="65.00"
                          inputMode="decimal"
                          onChange={(e) =>
                            updateMember(idx, { wage: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center">
                        <button
                          type="button"
                          onClick={() => removeMember(idx)}
                          aria-label="Remove member"
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
            <button
              type="button"
              onClick={addMember}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
            >
              <Plus size={12} />
              Add member
            </button>
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

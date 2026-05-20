import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import type { SearchableSelectOption } from "~/components/SearchableSelect";
import { useFormDialog } from "~/lib/use-form-dialog";
import { projectsQueryOptions } from "~/utils/projects";
import {
  ROLE_LABELS,
  ROLE_RANK,
  type AdminUser,
  type UserRole,
} from "~/utils/users";

// Derived from ROLE_RANK so a future privilege level shows up automatically.
const ROLE_VALUES = Object.keys(ROLE_RANK) as UserRole[];

export type UserFormState = {
  userId: number;
  role: UserRole;
  projectIds: number[];
};

export function UserDialog({
  trigger,
  initial,
  isSelf,
  onSubmit,
}: {
  trigger: React.ReactNode;
  /** The user being edited. Always required — users aren't created here. */
  initial: AdminUser;
  /** True when the caller is editing their own row. Disables role changes so
   *  admins can't lock themselves out (also enforced server-side). */
  isSelf: boolean;
  onSubmit: (form: UserFormState) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit } = useFormDialog<
    AdminUser,
    UserFormState
  >({
    initial,
    blank: () => ({
      userId: initial.id,
      role: initial.role,
      projectIds: initial.projects.map((p) => p.id),
    }),
    fromItem: (u) => ({
      userId: u.id,
      role: u.role,
      projectIds: u.projects.map((p) => p.id),
    }),
    onSubmit,
  });

  // Project list only fetched while the dialog is open. Admin users see
  // every project regardless, so this is purely for the assignment picker.
  const { data: projects = [] } = useQuery({
    ...projectsQueryOptions(),
    enabled: open,
  });

  const projectOptions: SearchableSelectOption[] = React.useMemo(
    () =>
      projects.map((p) => ({
        value: String(p.id),
        label: `${p.displayId} — ${p.name}`,
        searchText: `${p.displayId} ${p.name}`.toLowerCase(),
      })),
    [projects],
  );

  const adminBypass = form.role === "ADMINISTRATOR";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,560px)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Edit User</h2>
            <p className="text-xs text-slate-500">
              {initial.email}
              {isSelf && (
                <span className="ml-2 text-slate-400">(you)</span>
              )}
            </p>
          </div>

          <Labeled
            label="Role"
            help={
              isSelf
                ? "You can't change your own role."
                : "Administrators bypass project assignments and access every project."
            }
          >
            <NativeSelect
              value={form.role}
              onChange={(v) => update("role", v as UserRole)}
              options={ROLE_VALUES.map((r) => ({
                value: r,
                label: ROLE_LABELS[r],
              }))}
            />
          </Labeled>

          <Labeled
            label="Assigned projects"
            help={
              adminBypass
                ? "Administrators see every project regardless of this list."
                : "Projects this user can see and interact with."
            }
          >
            <SearchableMultiSelect
              values={form.projectIds.map(String)}
              options={projectOptions}
              placeholder="-- Select projects --"
              onChange={(v) =>
                update("projectIds", v.map((s) => Number(s)))
              }
            />
          </Labeled>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy || (isSelf && form.role !== initial.role)}
            >
              {busy ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

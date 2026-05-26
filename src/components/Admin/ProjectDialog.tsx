import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
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
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import type { SearchableSelectOption } from "~/components/SearchableSelect";
import { useFormDialog } from "~/lib/use-form-dialog";
import type { ProjectOption, UpsertProjectInput } from "~/utils/projects";
import { areasQueryOptions, deleteArea } from "~/utils/areas";
import { subcontractorsQueryOptions } from "~/utils/subcontractors";
import { usersQueryOptions } from "~/utils/users";

type FormState = UpsertProjectInput;

export function ProjectDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: ProjectOption;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const {
    open,
    setOpen,
    form,
    setForm,
    busy,
    update,
    handleSubmit,
    handleDelete,
  } = useFormDialog<ProjectOption, FormState>({
    initial,
    blank: () => ({
      displayId: "",
      name: "",
      description: "",
      subcontractorIds: [],
      userIds: [],
      addAreaIds: [],
    }),
    // M2M sub/user ids are filled in by an effect below once the data loads
    // — start them empty here.
    fromItem: (p) => ({
      id: p.id,
      displayId: p.displayId,
      name: p.name,
      description: p.description,
      subcontractorIds: [],
      userIds: [],
      addAreaIds: [],
    }),
    onSubmit,
    onDelete,
    deleteConfirm: (p) =>
      `Delete project "${p.displayId} — ${p.name}"? This also deletes its ` +
      `FEF rows, change log, FCOs, basis inputs, and areas. This cannot be ` +
      `undone.`,
  });
  // Tracks whether we've seeded the M2M sub/user selections from the server
  // data for this open. Prevents re-seeding mid-edit when queries refetch.
  const [primedSubs, setPrimedSubs] = React.useState(false);
  const [primedUsers, setPrimedUsers] = React.useState(false);

  // Lazy-load supporting data only while the dialog is open.
  const subsQuery = useQuery({
    ...subcontractorsQueryOptions(),
    enabled: open,
  });
  const areasQuery = useQuery({ ...areasQueryOptions(), enabled: open });
  const usersQuery = useQuery({ ...usersQueryOptions(), enabled: open });
  const allSubs = subsQuery.data ?? [];
  const allAreas = areasQuery.data ?? [];
  const allUsers = usersQuery.data ?? [];

  // Area deletion is immediate (areas can't exist without a project, so
  // "removing from a project" = deleting). Invalidate both areas and
  // projects so the dialog and the Areas page both reflect it.
  const deleteAreaMutation = useMutation({
    mutationFn: (id: number) => deleteArea({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    },
  });

  // Reset the "primed" flags when the dialog re-opens or the target changes
  // so the next data load can seed the multi-selects.
  React.useEffect(() => {
    if (open) {
      setPrimedSubs(false);
      setPrimedUsers(false);
    }
  }, [open, initial]);

  // Seed the sub multi-select with this project's current assignments once
  // the data is available.
  React.useEffect(() => {
    if (!open || primedSubs || subsQuery.data === undefined) return;
    const currentIds = initial?.id
      ? subsQuery.data
          .filter((s) => s.projects.some((p) => p.id === initial.id))
          .map((s) => s.id)
      : [];
    setForm((f) => ({ ...f, subcontractorIds: currentIds }));
    setPrimedSubs(true);
  }, [open, primedSubs, subsQuery.data, initial?.id, setForm]);

  // Same seeding pattern for the user multi-select.
  React.useEffect(() => {
    if (!open || primedUsers || usersQuery.data === undefined) return;
    const currentIds = initial?.id
      ? usersQuery.data
          .filter((u) => u.projects.some((p) => p.id === initial.id))
          .map((u) => u.id)
      : [];
    setForm((f) => ({ ...f, userIds: currentIds }));
    setPrimedUsers(true);
  }, [open, primedUsers, usersQuery.data, initial?.id, setForm]);

  // Subs assigned-here vs available — same shape so the M2M picker can list
  // every sub and the checkbox state reflects assignment.
  const subOptions: SearchableSelectOption[] = React.useMemo(
    () =>
      allSubs.map((s) => ({
        value: String(s.id),
        label: `${s.displayId} — ${s.name}`,
        searchText: `${s.displayId} ${s.name}`.toLowerCase(),
      })),
    [allSubs],
  );

  // User options — admins are automatically tagged in the label since they
  // bypass the per-project ACL.
  const userOptions: SearchableSelectOption[] = React.useMemo(
    () =>
      allUsers.map((u) => ({
        value: String(u.id),
        label:
          u.role === "ADMINISTRATOR" ? `${u.email} (admin)` : u.email,
        searchText: u.email.toLowerCase(),
      })),
    [allUsers],
  );

  // Areas split into "already under this project" (chips) and "available to
  // move in" (picker).
  const currentAreas = React.useMemo(
    () =>
      initial?.id
        ? allAreas.filter((a) => a.projectId === initial.id)
        : [],
    [allAreas, initial?.id],
  );
  const availableAreaOptions: SearchableSelectOption[] = React.useMemo(
    () =>
      allAreas
        .filter((a) => a.projectId !== initial?.id)
        .map((a) => ({
          value: String(a.id),
          label: a.name
            ? `${a.displayId} — ${a.name}`
            : a.displayId,
          searchText: `${a.displayId} ${a.name}`.toLowerCase(),
        })),
    [allAreas, initial?.id],
  );

  function handleRemoveArea(areaId: number, areaLabel: string) {
    if (
      !confirm(
        `Remove area "${areaLabel}" from this project? Because areas can't ` +
          `exist without a project, this will delete the area entirely. This ` +
          `cannot be undone.`,
      )
    )
      return;
    deleteAreaMutation.mutate(areaId);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,720px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Project" : "New Project"}
              </h2>
              <p className="text-xs text-slate-500">
                Identity, subcontractor assignments, and areas
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled label="Display ID" help="Short project code, e.g. 1901">
              <Input
                value={form.displayId}
                placeholder="1901"
                onChange={(e) => update("displayId", e.target.value)}
              />
            </Labeled>
            <Labeled label="Name" className="md:col-span-2">
              <Input
                value={form.name}
                placeholder="1901 - FIME Engineering"
                onChange={(e) => update("name", e.target.value)}
              />
            </Labeled>
          </div>

          <Labeled label="Description">
            <Textarea
              value={form.description}
              rows={3}
              placeholder="Short project description"
              onChange={(e) => update("description", e.target.value)}
            />
          </Labeled>

          <Labeled
            label="Subcontractors"
            help="Subcontractors engaged on this project"
          >
            <SearchableMultiSelect
              values={form.subcontractorIds.map(String)}
              options={subOptions}
              placeholder="-- Select subcontractors --"
              onChange={(v) =>
                update("subcontractorIds", v.map((s) => Number(s)))
              }
            />
          </Labeled>

          <Labeled
            label="Users with access"
            help="Non-admin users who can see and interact with this project. Administrators bypass this list and always have access."
          >
            <SearchableMultiSelect
              values={form.userIds.map(String)}
              options={userOptions}
              placeholder="-- Select users --"
              onChange={(v) => update("userIds", v.map((s) => Number(s)))}
            />
          </Labeled>

          {/* Areas — current set (immediate remove = delete) + picker to
              reassign other areas into this project on save. */}
          <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Areas
            </legend>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Currently under this project
              </span>
              {!initial?.id ? (
                <p className="text-xs text-slate-400">
                  Create the project first; you can then add areas from here
                  or the Areas admin page.
                </p>
              ) : currentAreas.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No areas yet — assign existing ones below or create them on
                  the Areas admin page.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {currentAreas.map((a) => {
                    const label = a.name
                      ? `${a.displayId} — ${a.name}`
                      : a.displayId;
                    return (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                      >
                        <span className="font-mono">{a.displayId}</span>
                        {a.name && (
                          <span className="text-slate-500">— {a.name}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveArea(a.id, label)}
                          aria-label={`Remove ${label}`}
                          disabled={deleteAreaMutation.isPending}
                          className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <Labeled
              label="Add areas to this project"
              help="Pick areas currently assigned elsewhere (or unassigned on creation) to move them here on save."
            >
              <SearchableMultiSelect
                values={form.addAreaIds.map(String)}
                options={availableAreaOptions}
                placeholder="-- Select areas --"
                onChange={(v) =>
                  update("addAreaIds", v.map((s) => Number(s)))
                }
              />
            </Labeled>
          </fieldset>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !form.displayId.trim() || !form.name.trim()}
            >
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

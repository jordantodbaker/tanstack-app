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
import { Textarea } from "~/components/ui/textarea";
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import type { AreaOption, UpsertAreaInput } from "~/utils/areas";
import type { ProjectOption } from "~/utils/projects";

type FormState = UpsertAreaInput;

function blankForm(projects: ProjectOption[]): FormState {
  // Default to the first project so the dropdown shows a real selection and
  // the Create button isn't mysteriously disabled on an unselected project.
  return {
    projectId: projects[0]?.id ?? 0,
    displayId: "",
    name: "",
    description: "",
  };
}

function fromItem(a: AreaOption): FormState {
  return {
    id: a.id,
    projectId: a.projectId,
    displayId: a.displayId,
    name: a.name,
    description: a.description,
  };
}

export function AreaDialog({
  trigger,
  initial,
  projects,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: AreaOption;
  projects: ProjectOption[];
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(() =>
    initial ? fromItem(initial) : blankForm(projects),
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(initial ? fromItem(initial) : blankForm(projects));
    }
    // `projects` intentionally omitted: re-running on a project-list refetch
    // would wipe in-progress input. The list at open time is what we need.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      await onSubmit(form);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id || !onDelete) return;
    if (
      !confirm(
        `Delete area "${initial.displayId} — ${initial.name}"? This cannot ` +
          `be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await onDelete(initial.id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    !busy &&
    form.projectId > 0 &&
    form.displayId.trim() !== "" &&
    form.name.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,560px)]">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Area" : "New Area"}
              </h2>
              <p className="text-xs text-slate-500">
                A physical location on a project
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

          <Labeled label="Project" help="The project this area belongs to">
            <NativeSelect
              value={String(form.projectId)}
              onChange={(v) => update("projectId", Number(v))}
              options={projects.map((p) => ({
                value: String(p.id),
                label: `${p.displayId} — ${p.name}`,
              }))}
            />
          </Labeled>

          <Labeled label="Area ID" help="Short area code, e.g. A-100">
            <Input
              value={form.displayId}
              placeholder="A-100"
              onChange={(e) => update("displayId", e.target.value)}
            />
          </Labeled>

          <Labeled label="Name">
            <Input
              value={form.name}
              placeholder="Pump House A"
              onChange={(e) => update("name", e.target.value)}
            />
          </Labeled>

          <Labeled label="Description">
            <Textarea
              value={form.description}
              rows={3}
              placeholder="Short description of the location"
              onChange={(e) => update("description", e.target.value)}
            />
          </Labeled>

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

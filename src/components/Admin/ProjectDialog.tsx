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
import { Labeled } from "~/components/ui/form-helpers";
import type { ProjectOption, UpsertProjectInput } from "~/utils/projects";

type FormState = UpsertProjectInput;

function blankForm(): FormState {
  return { displayId: "", name: "", description: "" };
}

function fromItem(p: ProjectOption): FormState {
  return {
    id: p.id,
    displayId: p.displayId,
    name: p.name,
    description: p.description,
  };
}

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
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(() =>
    initial ? fromItem(initial) : blankForm(),
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(initial ? fromItem(initial) : blankForm());
    }
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
        `Delete project "${initial.displayId} — ${initial.name}"? This also ` +
          `deletes its FEF rows, change log, FCOs, and basis inputs. This ` +
          `cannot be undone.`,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,560px)]">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Project" : "New Project"}
              </h2>
              <p className="text-xs text-slate-500">
                Project identity shown across the platform
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

          <Labeled label="Display ID" help="Short project code, e.g. 1901">
            <Input
              value={form.displayId}
              placeholder="1901"
              onChange={(e) => update("displayId", e.target.value)}
            />
          </Labeled>

          <Labeled label="Name">
            <Input
              value={form.name}
              placeholder="1901 - FIME Engineering"
              onChange={(e) => update("name", e.target.value)}
            />
          </Labeled>

          <Labeled label="Description">
            <Textarea
              value={form.description}
              rows={3}
              placeholder="Short project description"
              onChange={(e) => update("description", e.target.value)}
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

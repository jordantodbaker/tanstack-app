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
import { useFormDialog } from "~/lib/use-form-dialog";
import type { AreaOption, UpsertAreaInput } from "~/utils/areas";
import type { ProjectOption } from "~/utils/projects";

type FormState = UpsertAreaInput;

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
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<AreaOption, FormState>({
      initial,
      // Default to the first project so the dropdown shows a real selection
      // and the Create button isn't mysteriously disabled.
      blank: () => ({
        projectId: projects[0]?.id ?? 0,
        displayId: "",
        name: "",
        description: "",
      }),
      fromItem: (a) => ({
        id: a.id,
        projectId: a.projectId,
        displayId: a.displayId,
        name: a.name,
        description: a.description,
      }),
      onSubmit,
      onDelete,
      deleteConfirm: (a) =>
        `Delete area "${a.displayId} — ${a.name}"? This cannot be undone.`,
    });

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

import React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import type { SearchableSelectOption } from "~/components/SearchableSelect";
import { useFormDialog } from "~/lib/use-form-dialog";
import { disciplines } from "~/config/disciplines";
import { projectsQueryOptions } from "~/utils/projects";
import type {
  SubcontractorItem,
  UpsertSubcontractorInput,
} from "~/utils/subcontractors";

const DISCIPLINE_OPTIONS: SearchableSelectOption[] = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({
    value: d.id,
    label: d.label,
    searchText: d.label.toLowerCase(),
  }));

type FormState = UpsertSubcontractorInput;

export function SubcontractorDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: SubcontractorItem;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<SubcontractorItem, FormState>({
      initial,
      blank: () => ({
        displayId: "",
        name: "",
        description: "",
        disciplines: [],
        projectIds: [],
      }),
      fromItem: (s) => ({
        id: s.id,
        displayId: s.displayId,
        name: s.name,
        description: s.description,
        disciplines: s.disciplines,
        projectIds: s.projects.map((p) => p.id),
      }),
      onSubmit,
      onDelete,
      deleteConfirm: (s) =>
        `Delete subcontractor "${s.displayId} — ${s.name}"? This removes ` +
        `their project assignments. This cannot be undone.`,
    });

  // Only fetch the project list while the dialog is open.
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,640px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Subcontractor" : "New Subcontractor"}
              </h2>
              <p className="text-xs text-slate-500">
                Identity, project assignments, and disciplines performed
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
            <Labeled label="ID" help="Unique short code, e.g. SUB-001">
              <Input
                value={form.displayId}
                placeholder="SUB-001"
                onChange={(e) => update("displayId", e.target.value)}
              />
            </Labeled>
            <Labeled label="Name" className="md:col-span-2">
              <Input
                value={form.name}
                placeholder="Acme Mechanical Inc."
                onChange={(e) => update("name", e.target.value)}
              />
            </Labeled>
          </div>

          <Labeled label="Description">
            <Textarea
              value={form.description}
              rows={3}
              placeholder="Capabilities, location, contact info, certifications…"
              onChange={(e) => update("description", e.target.value)}
            />
          </Labeled>

          <Labeled
            label="Disciplines performed"
            help="Disciplines this subcontractor can deliver"
          >
            <SearchableMultiSelect
              values={form.disciplines}
              options={DISCIPLINE_OPTIONS}
              placeholder="-- Select disciplines --"
              onChange={(v) => update("disciplines", v)}
            />
          </Labeled>

          <Labeled
            label="Assigned projects"
            help="Projects this subcontractor is engaged on"
          >
            <SearchableMultiSelect
              values={form.projectIds.map(String)}
              options={projectOptions}
              placeholder="-- Select projects --"
              onChange={(v) => update("projectIds", v.map((s) => Number(s)))}
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

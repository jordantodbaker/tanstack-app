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
import { Checkbox } from "~/components/ui/checkbox";
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import { useCbsSearchableOptions } from "~/lib/use-cbs-searchable-options";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import { disciplines } from "~/config/disciplines";
import {
  FCO_ORIGIN_TYPES,
  FCO_PRIORITIES,
  type FcoOriginType,
  type FcoPriority,
} from "~/utils/fcoLog";
import {
  FCO_ORIGIN_LABELS,
  FCO_PRIORITY_LABELS,
} from "~/utils/fcoLogLabels";
import type {
  FcoTemplateAdminItem,
  UpsertFcoTemplateInput,
} from "~/utils/fcoTemplates";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

type FormState = UpsertFcoTemplateInput;

function blank(): FormState {
  return {
    name: "",
    templateDescription: "",
    title: "",
    description: "",
    originType: "FIELD_CONDITION",
    priority: "NORMAL",
    discipline: "",
    cbsCodes: [],
    locationArea: "",
    drawingRefs: [],
    rfiNumbers: [],
    initiatedBy: "",
    fieldContact: "",
    estimatedCost: 0,
    estimatedHours: 0,
    workStopped: false,
    photosUrl: "",
    reasonNarrative: "",
    notes: "",
  };
}

function fromItem(t: FcoTemplateAdminItem): FormState {
  return {
    id: t.id,
    name: t.name,
    templateDescription: t.templateDescription,
    title: t.title,
    description: t.description,
    originType: t.originType,
    priority: t.priority,
    discipline: t.discipline,
    cbsCodes: t.cbsCodes,
    locationArea: t.locationArea,
    drawingRefs: t.drawingRefs,
    rfiNumbers: t.rfiNumbers,
    initiatedBy: t.initiatedBy,
    fieldContact: t.fieldContact,
    estimatedCost: t.estimatedCost,
    estimatedHours: t.estimatedHours,
    workStopped: t.workStopped,
    photosUrl: t.photosUrl,
    reasonNarrative: t.reasonNarrative,
    notes: t.notes,
  };
}

export function FcoTemplateDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  initial?: FcoTemplateAdminItem;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<FcoTemplateAdminItem, FormState>({
      initial,
      blank,
      fromItem,
      onSubmit,
      onDelete,
      deleteConfirm: (t) =>
        `Delete template "${t.name}"? Existing FCOs created from this template are unaffected. This cannot be undone.`,
    });

  const cbsOptions = useCbsSearchableOptions();

  // Comma-separated text fields for the array columns. Commit on blur; mirrors
  // the FcoDialog pattern.
  const [drawingRefsText, setDrawingRefsText] = React.useState("");
  const [rfiNumbersText, setRfiNumbersText] = React.useState("");
  React.useEffect(() => {
    setDrawingRefsText(form.drawingRefs.join(", "));
    setRfiNumbersText(form.rfiNumbers.join(", "));
  }, [form.drawingRefs, form.rfiNumbers]);

  function commitList(raw: string, key: "drawingRefs" | "rfiNumbers") {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    update(key, items);
  }

  const canSave = !busy && form.name.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,900px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit FCO Template" : "New FCO Template"}
              </h2>
              <p className="text-xs text-slate-500">
                Reusable scaffold for repeat field changes. The FCO dialog
                shows these in a "Start from template" picker.
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Labeled label="Template Name" help="Shown in the picker. Unique.">
              <Input
                value={form.name}
                placeholder="RFI-driven rework"
                onChange={(e) => update("name", e.target.value)}
              />
            </Labeled>
            <Labeled
              label="Discipline"
              help="Picker filters by the current dialog's discipline."
            >
              <NativeSelect
                value={form.discipline}
                onChange={(v) => update("discipline", v)}
                options={[
                  { value: "", label: "— Any discipline —" },
                  ...DISCIPLINE_OPTIONS.map((d) => ({
                    value: d.id,
                    label: d.label,
                  })),
                ]}
              />
            </Labeled>
          </div>

          <Labeled
            label="Template description"
            help="What this template is for. Shown beside the name in the picker."
          >
            <Textarea
              value={form.templateDescription}
              rows={2}
              placeholder="Use when an RFI response requires re-work and the originator anticipates cost / hours impact."
              onChange={(e) => update("templateDescription", e.target.value)}
            />
          </Labeled>

          <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              FCO field defaults
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Labeled label="Title">
                <Input
                  value={form.title}
                  placeholder="Default title (user can override)"
                  onChange={(e) => update("title", e.target.value)}
                />
              </Labeled>
              <Labeled label="Initiated By">
                <Input
                  value={form.initiatedBy}
                  placeholder="Field crew / PM"
                  onChange={(e) => update("initiatedBy", e.target.value)}
                />
              </Labeled>
            </div>

            <Labeled label="Description">
              <Textarea
                value={form.description}
                rows={3}
                placeholder="Short summary — user will edit before saving."
                onChange={(e) => update("description", e.target.value)}
              />
            </Labeled>

            <Labeled label="Reason narrative">
              <Textarea
                value={form.reasonNarrative}
                rows={4}
                placeholder="Boilerplate narrative — the longer story of why this FCO was raised."
                onChange={(e) => update("reasonNarrative", e.target.value)}
              />
            </Labeled>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Labeled label="Origin">
                <NativeSelect
                  value={form.originType}
                  onChange={(v) => update("originType", v as FcoOriginType)}
                  options={FCO_ORIGIN_TYPES.map((t) => ({
                    value: t,
                    label: FCO_ORIGIN_LABELS[t],
                  }))}
                />
              </Labeled>
              <Labeled label="Priority">
                <NativeSelect
                  value={form.priority}
                  onChange={(v) => update("priority", v as FcoPriority)}
                  options={FCO_PRIORITIES.map((p) => ({
                    value: p,
                    label: FCO_PRIORITY_LABELS[p],
                  }))}
                />
              </Labeled>
              <Labeled label="Field Contact">
                <Input
                  value={form.fieldContact}
                  placeholder="Who in the field"
                  onChange={(e) => update("fieldContact", e.target.value)}
                />
              </Labeled>
              <Labeled
                label="Location Area"
                help="Area id (per-project). Usually blank in a template."
              >
                <Input
                  value={form.locationArea}
                  placeholder=""
                  onChange={(e) => update("locationArea", e.target.value)}
                />
              </Labeled>
            </div>

            <Labeled label="Affected CBS Codes">
              <SearchableMultiSelect
                values={form.cbsCodes}
                options={cbsOptions}
                placeholder="Search CBS items…"
                onChange={(v) => update("cbsCodes", v)}
              />
            </Labeled>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Labeled label="Drawing Refs (comma-separated)">
                <Input
                  value={drawingRefsText}
                  placeholder="DWG-101, DWG-204"
                  onChange={(e) => setDrawingRefsText(e.target.value)}
                  onBlur={() => commitList(drawingRefsText, "drawingRefs")}
                />
              </Labeled>
              <Labeled label="RFI Numbers (comma-separated)">
                <Input
                  value={rfiNumbersText}
                  placeholder="RFI-042"
                  onChange={(e) => setRfiNumbersText(e.target.value)}
                  onBlur={() => commitList(rfiNumbersText, "rfiNumbers")}
                />
              </Labeled>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Labeled label="Estimated Cost ($)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.estimatedCost}
                  onChange={(e) =>
                    update("estimatedCost", parseFloat(e.target.value) || 0)
                  }
                />
              </Labeled>
              <Labeled label="Estimated Hours">
                <Input
                  type="number"
                  step="0.1"
                  value={form.estimatedHours}
                  onChange={(e) =>
                    update("estimatedHours", parseFloat(e.target.value) || 0)
                  }
                />
              </Labeled>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <Checkbox
                    checked={form.workStopped}
                    onCheckedChange={(v) =>
                      update("workStopped", v === true)
                    }
                  />
                  Work stopped (default)
                </label>
              </div>
            </div>

            <Labeled label="External link" help="Optional — Procore / SharePoint URL.">
              <Input
                value={form.photosUrl}
                placeholder="https://..."
                onChange={(e) => update("photosUrl", e.target.value)}
              />
            </Labeled>

            <Labeled label="Internal Notes">
              <Textarea
                value={form.notes}
                rows={2}
                placeholder="Internal notes for the FCO (boilerplate)."
                onChange={(e) => update("notes", e.target.value)}
              />
            </Labeled>
          </fieldset>

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

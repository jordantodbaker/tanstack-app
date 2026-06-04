import React from "react";
import { Trash2 } from "lucide-react";
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
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import { useCbsSearchableOptions } from "~/lib/use-cbs-searchable-options";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import { disciplines } from "~/config/disciplines";
import {
  CHANGE_TYPES,
  RISK_LEVELS,
  type ChangeType,
  type RiskLevel,
} from "~/utils/changelog";
import { TYPE_LABELS, RISK_LABELS } from "~/utils/changelogLabels";
import type {
  CvrTemplateAdminItem,
  UpsertCvrTemplateInput,
} from "~/utils/cvrTemplates";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

type FormState = UpsertCvrTemplateInput;

function blank(): FormState {
  return {
    name: "",
    templateDescription: "",
    title: "",
    description: "",
    type: "SCOPE",
    discipline: "",
    cbsCodes: [],
    originator: "",
    costImpact: 0,
    scheduleDaysImpact: 0,
    laborHoursImpact: 0,
    riskLevel: "MEDIUM",
    reasonCode: "",
    notes: "",
    area: "",
  };
}

function fromItem(t: CvrTemplateAdminItem): FormState {
  return {
    id: t.id,
    name: t.name,
    templateDescription: t.templateDescription,
    title: t.title,
    description: t.description,
    type: t.type,
    discipline: t.discipline,
    cbsCodes: t.cbsCodes,
    originator: t.originator,
    costImpact: t.costImpact,
    scheduleDaysImpact: t.scheduleDaysImpact,
    laborHoursImpact: t.laborHoursImpact,
    riskLevel: t.riskLevel,
    reasonCode: t.reasonCode,
    notes: t.notes,
    area: t.area,
  };
}

export function CvrTemplateDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  initial?: CvrTemplateAdminItem;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<CvrTemplateAdminItem, FormState>({
      initial,
      blank,
      fromItem,
      onSubmit,
      onDelete,
      deleteConfirm: (t) =>
        `Delete template "${t.name}"? Existing CVRs created from this template are unaffected. This cannot be undone.`,
    });

  const cbsOptions = useCbsSearchableOptions();
  // Areas live per-project. Templates are global and store an Area.id as a
  // string; if the area doesn't exist on the project the user is using,
  // the form will surface a "stale id" warning on submit (no enforcement
  // beyond that — the user can clear or pick a new area at that point).
  // For now the field is plain text in the admin dialog.
  void useQuery;

  const canSave = !busy && form.name.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,900px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit CVR Template" : "New CVR Template"}
              </h2>
              <p className="text-xs text-slate-500">
                Reusable scaffold for repeat scope changes (Weather Delay,
                Owner Directive Rework, Design Omission…). The CVR dialog
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
                placeholder="Weather Delay"
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
              placeholder="Use when site work is suspended by weather and the schedule slips one or more days."
              onChange={(e) => update("templateDescription", e.target.value)}
            />
          </Labeled>

          <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              CVR field defaults
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Labeled label="Title">
                <Input
                  value={form.title}
                  placeholder="Default title (user can override)"
                  onChange={(e) => update("title", e.target.value)}
                />
              </Labeled>
              <Labeled label="Originator">
                <Input
                  value={form.originator}
                  placeholder="Owner, Engineer, PM…"
                  onChange={(e) => update("originator", e.target.value)}
                />
              </Labeled>
            </div>

            <Labeled label="Description">
              <Textarea
                value={form.description}
                rows={4}
                placeholder="Boilerplate narrative — the user will edit before saving."
                onChange={(e) => update("description", e.target.value)}
              />
            </Labeled>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Labeled label="Type">
                <NativeSelect
                  value={form.type}
                  onChange={(v) => update("type", v as ChangeType)}
                  options={CHANGE_TYPES.map((t) => ({
                    value: t,
                    label: TYPE_LABELS[t],
                  }))}
                />
              </Labeled>
              <Labeled label="Risk">
                <NativeSelect
                  value={form.riskLevel}
                  onChange={(v) => update("riskLevel", v as RiskLevel)}
                  options={RISK_LEVELS.map((r) => ({
                    value: r,
                    label: RISK_LABELS[r],
                  }))}
                />
              </Labeled>
              <Labeled label="Reason Code">
                <Input
                  value={form.reasonCode}
                  placeholder="OWNER_REQUEST"
                  onChange={(e) => update("reasonCode", e.target.value)}
                />
              </Labeled>
              <Labeled
                label="Area"
                help="Area id (per-project). Often blank in a template."
              >
                <Input
                  value={form.area}
                  placeholder=""
                  onChange={(e) => update("area", e.target.value)}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Labeled label="Cost Impact ($)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.costImpact}
                  onChange={(e) =>
                    update("costImpact", parseFloat(e.target.value) || 0)
                  }
                />
              </Labeled>
              <Labeled label="Schedule Days Impact">
                <Input
                  type="number"
                  step="1"
                  value={form.scheduleDaysImpact}
                  onChange={(e) =>
                    update(
                      "scheduleDaysImpact",
                      parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
              </Labeled>
              <Labeled label="Labor Hours Impact">
                <Input
                  type="number"
                  step="0.1"
                  value={form.laborHoursImpact}
                  onChange={(e) =>
                    update("laborHoursImpact", parseFloat(e.target.value) || 0)
                  }
                />
              </Labeled>
            </div>

            <Labeled label="Notes">
              <Textarea
                value={form.notes}
                rows={2}
                placeholder="Internal notes for the CVR (boilerplate)."
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

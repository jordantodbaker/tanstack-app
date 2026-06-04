import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Printer, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { EntityDialogShell } from "~/components/EntityDialog/EntityDialogShell";
import { useCbsSearchableOptions } from "~/lib/use-cbs-searchable-options";
import { TemplatePicker } from "~/components/EntityDialog/TemplatePicker";
import {
  fcoTemplatePickerQueryOptions,
  instantiateFcoTemplate,
  saveAsFcoTemplate,
  type FcoTemplateFieldSet,
} from "~/utils/fcoTemplates";
import { useIsAdmin } from "~/lib/use-current-user";
import { invalidateAdminEntity } from "~/lib/admin-invalidations";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Labeled,
  NativeSelect,
  fromDateInputValue,
  toDateInputValue,
} from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  FCO_ORIGIN_TYPES,
  FCO_PRIORITIES,
  cvrOptionsQueryOptions,
  fcoQueryOptions,
  type FcoItem,
  type FcoListItem,
  type FcoOriginType,
  type FcoPriority,
  type UpsertFcoInput,
} from "~/utils/fcoLog";
import { FCO_TRANSITIONS, availableTransitions } from "~/utils/workflow";
import { useCurrentUser } from "~/lib/use-current-user";
import { WorkflowActions } from "~/components/WorkflowActions";
import { disciplines } from "~/config/disciplines";
import {
  FCO_ORIGIN_LABELS,
  FCO_PRIORITY_LABELS,
  FcoStatusBadge,
} from "~/components/FCOLog/FcoBadges";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import type { SearchableSelectOption } from "~/components/SearchableSelect";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "~/components/ui/tabs";
import { AuditTimeline } from "~/components/AuditTimeline";
import { Attachments } from "~/components/Attachments";
import { Comments } from "~/components/Comments";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

type FormState = Omit<UpsertFcoInput, "projectId">;

function blankForm(): FormState {
  return {
    fcoNumber: "",
    title: "",
    description: "",
    status: "DRAFT",
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
    resolution: "",
    notes: "",
    initiatedAt: new Date().toISOString(),
    neededBy: null,
    closedAt: null,
    linkedCvrId: null,
  };
}

function fromItem(item: FcoItem): FormState {
  return {
    id: item.id,
    fcoNumber: item.fcoNumber,
    title: item.title,
    description: item.description,
    status: item.status,
    originType: item.originType,
    priority: item.priority,
    discipline: item.discipline,
    cbsCodes: item.cbsCodes,
    locationArea: item.locationArea,
    drawingRefs: item.drawingRefs,
    rfiNumbers: item.rfiNumbers,
    initiatedBy: item.initiatedBy,
    fieldContact: item.fieldContact,
    estimatedCost: item.estimatedCost,
    estimatedHours: item.estimatedHours,
    workStopped: item.workStopped,
    photosUrl: item.photosUrl,
    reasonNarrative: item.reasonNarrative,
    resolution: item.resolution,
    notes: item.notes,
    initiatedAt: item.initiatedAt,
    neededBy: item.neededBy,
    closedAt: item.closedAt,
    linkedCvrId: item.linkedCvrId,
  };
}

type FcoDialogProps = {
  trigger: React.ReactNode;
  /** Slim list-item shape. The dialog fetches the full record (with
   *  `description` / `reasonNarrative` / `resolution` / `notes` /
   *  `photosUrl`) on open and gates the form body until it arrives. */
  initial?: FcoListItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  onPromote?: (id: number) => Promise<unknown>;
  /**
   * Run a workflow status transition. Only meaningful in edit mode; the dialog
   * renders one button per transition allowed by the current user's role and
   * originator status. See `FCO_TRANSITIONS` in workflow.ts.
   */
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
};

/**
 * Outer wrapper. Delegates dialog state + lazy-fetch boilerplate to
 * `EntityDialogShell`; `FcoDialogBody` only mounts once the full record is
 * ready, so its `useFormDialog` seeds the form with complete data on the
 * first render (avoids a flicker where heavy text fields would be blank
 * for ~100ms before re-seeding from the network response).
 */
export function FcoDialog({
  trigger,
  initial,
  projectId,
  onSubmit,
  onDelete,
  onPromote,
  onTransition,
}: FcoDialogProps) {
  return (
    <EntityDialogShell
      trigger={trigger}
      initial={initial}
      fullQueryOptions={fcoQueryOptions}
      loadingLabel="Loading FCO…"
    >
      {(full, closeDialog) => (
        <FcoDialogBody
          initial={full}
          projectId={projectId}
          onSubmit={onSubmit}
          onDelete={onDelete}
          onPromote={onPromote}
          onTransition={onTransition}
          closeDialog={closeDialog}
        />
      )}
    </EntityDialogShell>
  );
}

function FcoDialogBody({
  initial,
  projectId,
  onSubmit,
  onDelete,
  onPromote,
  onTransition,
  closeDialog,
}: {
  /** Full record (loaded by the outer) or undefined for new-mode. */
  initial?: FcoItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  onPromote?: (id: number) => Promise<unknown>;
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
  closeDialog: () => void;
}) {
  const {
    form,
    setForm,
    busy,
    setBusy,
    update,
    handleSubmit,
    handleDelete,
  } = useFormDialog<FcoItem, FormState>({
    initial,
    blank: blankForm,
    fromItem,
    onSubmit: async (formState) => {
      await onSubmit(formState);
      closeDialog();
    },
    onDelete: onDelete
      ? async (id) => {
          await onDelete(id);
          closeDialog();
        }
      : undefined,
    deleteConfirm: (i) => `Delete FCO "${i.title}"? This cannot be undone.`,
  });

  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();

  /** Fold a template's field set into the current draft. Identity (id,
   *  fcoNumber) and status/dates stay on whatever the user entered. */
  function applyTemplate(t: FcoTemplateFieldSet) {
    setForm((f) => ({
      ...f,
      title: t.title || f.title,
      description: t.description || f.description,
      originType: t.originType,
      priority: t.priority,
      discipline: t.discipline || f.discipline,
      cbsCodes: t.cbsCodes.length > 0 ? t.cbsCodes : f.cbsCodes,
      locationArea: t.locationArea || f.locationArea,
      drawingRefs: t.drawingRefs.length > 0 ? t.drawingRefs : f.drawingRefs,
      rfiNumbers: t.rfiNumbers.length > 0 ? t.rfiNumbers : f.rfiNumbers,
      initiatedBy: t.initiatedBy || f.initiatedBy,
      fieldContact: t.fieldContact || f.fieldContact,
      estimatedCost: t.estimatedCost,
      estimatedHours: t.estimatedHours,
      workStopped: t.workStopped,
      photosUrl: t.photosUrl || f.photosUrl,
      reasonNarrative: t.reasonNarrative || f.reasonNarrative,
      notes: t.notes || f.notes,
    }));
  }

  async function handleSaveAsTemplate() {
    const name = window.prompt(
      "Name this template (shown in the picker — e.g. 'RFI-driven rework'):",
    );
    if (!name || !name.trim()) return;
    const templateDescription =
      window.prompt(
        "Optional description shown beside the name in the picker:",
        "",
      ) ?? "";
    setBusy(true);
    try {
      await saveAsFcoTemplate({
        data: {
          name: name.trim(),
          templateDescription,
          title: form.title,
          description: form.description,
          originType: form.originType,
          priority: form.priority,
          discipline: form.discipline,
          cbsCodes: form.cbsCodes,
          locationArea: form.locationArea,
          drawingRefs: form.drawingRefs,
          rfiNumbers: form.rfiNumbers,
          initiatedBy: form.initiatedBy,
          fieldContact: form.fieldContact,
          estimatedCost: form.estimatedCost,
          estimatedHours: form.estimatedHours,
          workStopped: form.workStopped,
          photosUrl: form.photosUrl,
          reasonNarrative: form.reasonNarrative,
          notes: form.notes,
        },
      });
      invalidateAdminEntity(queryClient, "fcoTemplates");
    } finally {
      setBusy(false);
    }
  }

  const { data: currentUser } = useCurrentUser();
  const isOriginator =
    !!currentUser &&
    initial?.createdById !== null &&
    initial?.createdById === currentUser.id;
  const transitions =
    initial && currentUser && onTransition
      ? availableTransitions(
          FCO_TRANSITIONS,
          initial.status,
          currentUser.role,
          isOriginator,
        )
      : [];

  // `open` is implicitly true — this component only mounts when the outer
  // dialog is open and the full record has loaded.
  const { data: cvrOptions = [] } = useQuery({
    ...cvrOptionsQueryOptions(projectId),
    enabled: projectId !== null,
  });

  const cbsOptions: SearchableSelectOption[] = useCbsSearchableOptions();

  // Areas for the selected project — populates the Area dropdown. We store
  // the area id as a string in `locationArea`, mirroring the FefRow.area
  // convention, so legacy free-text values gracefully fall back to "— None —"
  // (and the user can re-pick on save).
  const { data: areas = [] } = useQuery({
    ...areasByProjectQueryOptions(projectId),
    enabled: projectId !== null,
  });

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

  async function handlePromote() {
    if (!initial?.id || !onPromote) return;
    if (
      !confirm(
        "Promote this FCO to a new CVR in the Change Log? The FCO will be linked and marked Linked-to-CVR.",
      )
    )
      return;
    setBusy(true);
    try {
      await onPromote(initial.id);
      closeDialog();
    } finally {
      setBusy(false);
    }
  }

  const canPromote =
    initial && !initial.linkedCvrId && onPromote && projectId !== null;

  return (
    <>
      <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Field Change Order" : "New Field Change Order"}
              </h2>
              <p className="text-xs text-slate-500">
                Capture a change originating in the field — drawings, conditions,
                cost impact, and CVR linkage
              </p>
            </div>
            <div className="flex items-center gap-2">
              {initial?.id && (
                <a
                  href={`/fco-print/${initial.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  title="Open the printable / PDF version in a new tab"
                >
                  <Printer className="size-3.5" />
                  Print / PDF
                </a>
              )}
              {canPromote && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePromote}
                  disabled={busy}
                  className="text-violet-700 hover:bg-violet-50"
                >
                  <ArrowUpRight className="size-3.5 mr-1" />
                  Promote to CVR
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsTemplate}
                  disabled={busy || !form.title.trim()}
                  title="Snapshot the current form as a new FCO template"
                  className="text-violet-700 hover:bg-violet-50"
                >
                  Save as Template
                </Button>
              )}
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
          </div>

          {initial?.linkedCvrId && (
            <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 flex items-center gap-2">
              <ExternalLink className="size-4" />
              <span>
                Linked to CVR{" "}
                <span className="font-mono font-semibold">
                  {initial.linkedCvrNumber || `#${initial.linkedCvrId}`}
                </span>
                {initial.linkedCvrTitle && (
                  <span className="text-violet-700"> — {initial.linkedCvrTitle}</span>
                )}
              </span>
            </div>
          )}

          {initial?.linkedRfiId && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 flex items-center gap-2">
              <ExternalLink className="size-4" />
              <span>
                Promoted from RFI{" "}
                <span className="font-mono font-semibold">
                  {initial.linkedRfiNumber || `#${initial.linkedRfiId}`}
                </span>
                {initial.linkedRfiSubject && (
                  <span className="text-indigo-700">
                    {" "}
                    — {initial.linkedRfiSubject}
                  </span>
                )}
              </span>
            </div>
          )}

          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-4 mt-3">

          {!initial && (
            <TemplatePicker<FcoTemplateFieldSet>
              pickerQueryOptions={fcoTemplatePickerQueryOptions}
              instantiate={instantiateFcoTemplate}
              currentDiscipline={form.discipline}
              onSelect={applyTemplate}
              noun="FCO"
            />
          )}

          {/* Identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled label="FCO Number">
              <Input
                value={form.fcoNumber}
                placeholder="FCO-001"
                onChange={(e) => update("fcoNumber", e.target.value)}
              />
            </Labeled>
            <Labeled label="Title" className="md:col-span-2">
              <Input
                value={form.title}
                placeholder="Short description"
                onChange={(e) => update("title", e.target.value)}
              />
            </Labeled>
          </div>

          {/* State row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Labeled
              label="Status"
              help={
                initial
                  ? "Use the workflow actions below to advance status."
                  : "New FCOs start as Draft."
              }
            >
              <div className="flex h-9 items-center">
                <FcoStatusBadge status={initial ? initial.status : "DRAFT"} />
              </div>
            </Labeled>
            <Labeled label="Origin">
              <NativeSelect
                value={form.originType}
                onChange={(v) => update("originType", v as FcoOriginType)}
                options={FCO_ORIGIN_TYPES.map((s) => ({
                  value: s,
                  label: FCO_ORIGIN_LABELS[s],
                }))}
              />
            </Labeled>
            <Labeled label="Priority">
              <NativeSelect
                value={form.priority}
                onChange={(v) => update("priority", v as FcoPriority)}
                options={FCO_PRIORITIES.map((s) => ({
                  value: s,
                  label: FCO_PRIORITY_LABELS[s],
                }))}
              />
            </Labeled>
            <Labeled label="Discipline">
              <NativeSelect
                value={form.discipline}
                onChange={(v) => update("discipline", v)}
                options={[
                  { value: "", label: "—" },
                  ...DISCIPLINE_OPTIONS.map((d) => ({
                    value: d.id,
                    label: d.label,
                  })),
                ]}
              />
            </Labeled>
          </div>

          {initial && onTransition && (
            <WorkflowActions
              transitions={transitions}
              busy={busy}
              setBusy={setBusy}
              onTransition={onTransition}
              entityId={initial.id}
              entityNoun="FCO"
              onSuccess={closeDialog}
            />
          )}

          {/* Field context */}
          <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Field Context
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Labeled
                label="Area"
                help={
                  projectId === null
                    ? "Select a project first."
                    : areas.length === 0
                      ? "No areas defined. Add some in Admin → Areas."
                      : undefined
                }
              >
                <NativeSelect
                  value={form.locationArea}
                  onChange={(v) => update("locationArea", v)}
                  options={[
                    { value: "", label: "— None —" },
                    ...areas.map((a) => ({
                      value: String(a.id),
                      label: a.name ? `${a.displayId} — ${a.name}` : a.displayId,
                    })),
                  ]}
                />
              </Labeled>
              <Labeled label="Initiated By">
                <Input
                  value={form.initiatedBy}
                  placeholder="Foreman / field engineer"
                  onChange={(e) => update("initiatedBy", e.target.value)}
                />
              </Labeled>
              <Labeled label="Field Contact (phone)">
                <Input
                  value={form.fieldContact}
                  placeholder="555-123-4567"
                  onChange={(e) => update("fieldContact", e.target.value)}
                />
              </Labeled>
            </div>
            <Labeled label="Reason / Field Conditions">
              <Textarea
                value={form.reasonNarrative}
                rows={2}
                placeholder="What was discovered in the field that prompted this change"
                onChange={(e) => update("reasonNarrative", e.target.value)}
              />
            </Labeled>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Labeled
                label="Drawing References"
                help="Comma-separated (e.g. P-101-A, M-303-B)"
              >
                <Input
                  value={drawingRefsText}
                  onChange={(e) => setDrawingRefsText(e.target.value)}
                  onBlur={(e) => commitList(e.target.value, "drawingRefs")}
                  placeholder="P-101-A, M-303-B"
                />
              </Labeled>
              <Labeled label="Related RFIs" help="Comma-separated RFI numbers">
                <Input
                  value={rfiNumbersText}
                  onChange={(e) => setRfiNumbersText(e.target.value)}
                  onBlur={(e) => commitList(e.target.value, "rfiNumbers")}
                  placeholder="RFI-042, RFI-049"
                />
              </Labeled>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.workStopped}
                onCheckedChange={(v) => update("workStopped", v === true)}
              />
              <span className="font-medium text-slate-700">
                Work currently stopped on this scope
              </span>
            </label>
          </fieldset>

          {/* Description */}
          <Labeled label="Description of Change">
            <Textarea
              value={form.description}
              placeholder="What scope is being added, removed, or revised"
              rows={3}
              onChange={(e) => update("description", e.target.value)}
            />
          </Labeled>

          <Labeled
            label="Affected CBS Codes"
            help="Search and select one or more CBS items"
          >
            <SearchableMultiSelect
              values={form.cbsCodes}
              options={cbsOptions}
              placeholder="Search CBS items…"
              onChange={(v) => update("cbsCodes", v)}
            />
          </Labeled>

          {/* Impact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Labeled label="Estimated Cost Impact ($)">
              <Input
                type="number"
                step="0.01"
                value={form.estimatedCost}
                onChange={(e) =>
                  update("estimatedCost", parseFloat(e.target.value) || 0)
                }
              />
            </Labeled>
            <Labeled label="Estimated Labor Hours">
              <Input
                type="number"
                step="0.1"
                value={form.estimatedHours}
                onChange={(e) =>
                  update("estimatedHours", parseFloat(e.target.value) || 0)
                }
              />
            </Labeled>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled label="Initiated Date">
              <Input
                type="date"
                value={toDateInputValue(form.initiatedAt)}
                onChange={(e) =>
                  update(
                    "initiatedAt",
                    fromDateInputValue(e.target.value) ??
                      new Date().toISOString(),
                  )
                }
              />
            </Labeled>
            <Labeled label="Needed By">
              <Input
                type="date"
                value={toDateInputValue(form.neededBy)}
                onChange={(e) =>
                  update("neededBy", fromDateInputValue(e.target.value))
                }
              />
            </Labeled>
            <Labeled label="Closed Date">
              <Input
                type="date"
                value={toDateInputValue(form.closedAt)}
                onChange={(e) =>
                  update("closedAt", fromDateInputValue(e.target.value))
                }
              />
            </Labeled>
          </div>

          {/* CVR link */}
          <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              CVR Linkage
            </legend>
            <Labeled
              label="Link to existing CVR"
              help="Optional — pick a CVR from the Change Log to attach this FCO to. Use Promote to CVR above to create a new one instead."
            >
              <NativeSelect
                value={form.linkedCvrId === null ? "" : String(form.linkedCvrId)}
                onChange={(v) =>
                  update("linkedCvrId", v === "" ? null : Number(v))
                }
                options={[
                  { value: "", label: "— Not linked —" },
                  ...cvrOptions.map((c) => ({
                    value: String(c.id),
                    label: `${c.cvrNumber || `#${c.id}`} — ${c.title}`.slice(
                      0,
                      80,
                    ),
                  })),
                ]}
              />
            </Labeled>
          </fieldset>

          <Labeled label="Resolution">
            <Textarea
              value={form.resolution}
              rows={2}
              placeholder="How the change was resolved in the field"
              onChange={(e) => update("resolution", e.target.value)}
            />
          </Labeled>

          <Labeled label="Internal Notes">
            <Textarea
              value={form.notes}
              rows={2}
              placeholder="Internal notes, references"
              onChange={(e) => update("notes", e.target.value)}
            />
          </Labeled>

            </TabsContent>
            <TabsContent value="attachments" className="mt-3 space-y-4">
              <Labeled
                label="External link"
                help="Optional — link to an external doc store (Procore, SharePoint, etc.) when the source of truth lives outside this app."
              >
                <Input
                  value={form.photosUrl}
                  placeholder="https://..."
                  onChange={(e) => update("photosUrl", e.target.value)}
                />
              </Labeled>
              <Attachments
                entityType="FieldChangeOrder"
                entityId={initial?.id ?? null}
                projectId={initial?.projectId ?? null}
              />
            </TabsContent>
            <TabsContent value="comments" className="mt-3">
              <Comments
                entityType="FieldChangeOrder"
                entityId={initial?.id ?? null}
                projectId={initial?.projectId ?? null}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-3">
              <AuditTimeline
                entityType="FieldChangeOrder"
                entityId={initial?.id ?? null}
                projectId={initial?.projectId ?? null}
              />
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !form.title.trim()}
            >
              {busy ? "Saving…" : initial ? "Save Changes" : "Create FCO"}
            </Button>
          </div>
      </div>
    </>
  );
}


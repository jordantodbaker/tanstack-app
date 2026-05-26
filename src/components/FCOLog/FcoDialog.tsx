import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Trash2, ArrowUpRight } from "lucide-react";
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
  type FcoItem,
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
import { cbsCodeOptionsQueryOptions } from "~/utils/cbs";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "~/components/ui/tabs";
import { AuditTimeline } from "~/components/AuditTimeline";

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

export function FcoDialog({
  trigger,
  initial,
  projectId,
  onSubmit,
  onDelete,
  onPromote,
  onTransition,
}: {
  trigger: React.ReactNode;
  initial?: FcoItem;
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
}) {
  const {
    open,
    setOpen,
    form,
    busy,
    setBusy,
    update,
    handleSubmit,
    handleDelete,
  } = useFormDialog<FcoItem, FormState>({
    initial,
    blank: blankForm,
    fromItem,
    onSubmit,
    onDelete,
    deleteConfirm: (i) => `Delete FCO "${i.title}"? This cannot be undone.`,
  });

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

  const { data: cvrOptions = [] } = useQuery({
    ...cvrOptionsQueryOptions(projectId),
    enabled: open && projectId !== null,
  });

  const { data: cbsCodeOptions = [] } = useQuery({
    ...cbsCodeOptionsQueryOptions(),
    enabled: open,
  });

  // Areas for the selected project — populates the Area dropdown. We store
  // the area id as a string in `locationArea`, mirroring the FefRow.area
  // convention, so legacy free-text values gracefully fall back to "— None —"
  // (and the user can re-pick on save).
  const { data: areas = [] } = useQuery({
    ...areasByProjectQueryOptions(projectId),
    enabled: open && projectId !== null,
  });

  const cbsOptions: SearchableSelectOption[] = React.useMemo(
    () =>
      cbsCodeOptions.map((c) => ({
        value: c.displayCode,
        label: c.name ? `${c.displayCode} — ${c.name}` : c.displayCode,
        searchText: `${c.displayCode} ${c.name ?? ""}`.toLowerCase(),
      })),
    [cbsCodeOptions],
  );

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
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const canPromote =
    initial && !initial.linkedCvrId && onPromote && projectId !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,1100px)] max-h-[90vh] overflow-y-auto">
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

          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-4 mt-3">

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
              onSuccess={() => setOpen(false)}
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
            <Labeled label="Photos / Attachments URL">
              <Input
                value={form.photosUrl}
                placeholder="https://..."
                onChange={(e) => update("photosUrl", e.target.value)}
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
      </DialogContent>
    </Dialog>
  );
}


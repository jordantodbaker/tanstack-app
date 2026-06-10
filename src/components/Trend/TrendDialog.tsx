import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Link as LinkIcon, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { EntityDialogShell } from "~/components/EntityDialog/EntityDialogShell";
import { useCbsSearchableOptions } from "~/lib/use-cbs-searchable-options";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Labeled,
  NativeSelect,
  fromDateInputValue,
  toDateInputValue,
} from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  TREND_PRIORITIES,
  trendForecastContribution,
  trendQueryOptions,
  type TrendItem,
  type TrendListItem,
  type TrendPriority,
  type UpsertTrendInput,
} from "~/utils/trends";
import { TREND_TRANSITIONS, availableTransitions } from "~/utils/workflow";
import { useCurrentUser } from "~/lib/use-current-user";
import { hasAtLeastRole } from "~/utils/users";
import { WorkflowActions } from "~/components/WorkflowActions";
import { disciplines } from "~/config/disciplines";
import { TREND_PRIORITY_LABELS } from "~/utils/trendLabels";
import { TrendStatusBadge } from "~/components/Trend/TrendBadges";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import type { SearchableSelectOption } from "~/components/SearchableSelect";
import { rfiListQueryOptions } from "~/utils/rfis";
import { fcoListQueryOptions } from "~/utils/fcoLog";
import { formatMoney } from "~/lib/formatting";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "~/components/ui/tabs";
import {
  EntityAuxTabTriggers,
  EntityAuxTabPanels,
} from "~/components/EntityDialog/EntityAuxTabs";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

type FormState = Omit<UpsertTrendInput, "projectId">;

function blankForm(): FormState {
  return {
    trendNumber: "",
    title: "",
    description: "",
    priority: "NORMAL",
    discipline: "",
    cbsCodes: [],
    locationArea: "",
    // 50% probability + $0 cost is the "I'm logging a hunch, will size it
    // later" starting state. AFC contribution is zero until costLikely > 0.
    probability: 0.5,
    costLow: 0,
    costLikely: 0,
    costHigh: 0,
    scheduleDaysImpact: 0,
    reasonNarrative: "",
    notes: "",
    identifiedAt: new Date().toISOString(),
    neededBy: null,
    linkedRfiId: null,
    linkedFcoId: null,
    initiatedBy: "",
  };
}

function fromItem(item: TrendItem): FormState {
  return {
    id: item.id,
    trendNumber: item.trendNumber,
    title: item.title,
    description: item.description,
    priority: item.priority,
    discipline: item.discipline,
    cbsCodes: item.cbsCodes,
    locationArea: item.locationArea,
    probability: item.probability,
    costLow: item.costLow,
    costLikely: item.costLikely,
    costHigh: item.costHigh,
    scheduleDaysImpact: item.scheduleDaysImpact,
    reasonNarrative: item.reasonNarrative,
    notes: item.notes,
    identifiedAt: item.identifiedAt,
    neededBy: item.neededBy,
    linkedRfiId: item.linkedRfiId,
    linkedFcoId: item.linkedFcoId,
    initiatedBy: item.initiatedBy,
  };
}

type TrendDialogProps = {
  trigger: React.ReactNode;
  /** Slim list-item shape. The dialog lazy-fetches the full record on open
   *  so heavy text fields populate correctly. */
  initial?: TrendListItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  /** Run a workflow transition. See `TREND_TRANSITIONS`. */
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
  /** Promote this trend to a CVR. Creates the CVR and moves the trend to
   *  CONVERTED in one transaction. APPROVER+ only on the server. */
  onPromote?: (id: number) => Promise<unknown>;
};

export function TrendDialog({
  trigger,
  initial,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
}: TrendDialogProps) {
  return (
    <EntityDialogShell
      trigger={trigger}
      initial={initial}
      fullQueryOptions={trendQueryOptions}
      loadingLabel="Loading Trend…"
      contentClassName="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,1000px)] max-h-[90vh] overflow-y-auto"
    >
      {(full, closeDialog) => (
        <TrendDialogBody
          initial={full}
          projectId={projectId}
          onSubmit={onSubmit}
          onDelete={onDelete}
          onTransition={onTransition}
          onPromote={onPromote}
          closeDialog={closeDialog}
        />
      )}
    </EntityDialogShell>
  );
}

function TrendDialogBody({
  initial,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
  closeDialog,
}: {
  initial?: TrendItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
  onPromote?: (id: number) => Promise<unknown>;
  closeDialog: () => void;
}) {
  const {
    form,
    busy,
    setBusy,
    update,
    handleSubmit,
    handleDelete,
  } = useFormDialog<TrendItem, FormState>({
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
    deleteConfirm: (i) =>
      `Delete trend "${i.title}"? This cannot be undone.`,
  });

  const { data: currentUser } = useCurrentUser();
  const isOriginator =
    !!currentUser &&
    initial?.createdById !== null &&
    initial?.createdById === currentUser?.id;
  const transitions =
    initial && currentUser && onTransition
      ? availableTransitions(
          TREND_TRANSITIONS,
          initial.status,
          currentUser.role,
          isOriginator,
        )
      : [];

  // Promote-to-CVR is available from IDENTIFIED or PROBABLE, gated to
  // APPROVER+. The server re-checks role and originator; this hide is UX.
  const canPromote =
    !!initial &&
    !!onPromote &&
    !!currentUser &&
    hasAtLeastRole(currentUser.role, "APPROVER") &&
    !isOriginator &&
    (initial.status === "IDENTIFIED" || initial.status === "PROBABLE");

  async function handlePromote() {
    if (!initial?.id || !onPromote) return;
    if (
      !confirm(
        "Promote this trend to a CVR? A new CVR will be created with the trend's likely cost as its cost impact, and the trend will be marked Converted.",
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

  // `open` is implicitly true — only mounted when outer is open + full loaded.
  const cbsOptions: SearchableSelectOption[] = useCbsSearchableOptions();
  const { data: areas = [] } = useQuery({
    ...areasByProjectQueryOptions(projectId),
    enabled: projectId !== null,
  });
  const { data: rfiList = [] } = useQuery({
    ...rfiListQueryOptions(projectId),
    enabled: projectId !== null,
  });
  const { data: fcoList = [] } = useQuery({
    ...fcoListQueryOptions(projectId),
    enabled: projectId !== null,
  });

  // Live AFC contribution preview — `probability × costLikely`, scoped to
  // the current draft. Surfaces immediately so a PM can dial probability
  // and see the forecast effect without saving + re-opening the EVM page.
  const previewContribution = trendForecastContribution({
    status: initial?.status ?? "IDENTIFIED",
    probability: form.probability,
    costLikely: form.costLikely,
  });

  return (
    <>
      <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Trend" : "New Trend"}
              </h2>
              <p className="text-xs text-slate-500">
                Anticipated cost impact that hasn't been approved yet. Drives
                the project's AFC (Anticipated Final Cost) at{" "}
                <span className="font-mono">probability × likely cost</span>.
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
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-medium">
                <LinkIcon className="size-4" />
                Promoted to CVR #{initial.linkedCvrId}
              </div>
              <p className="mt-0.5 text-xs text-emerald-800">
                This trend is now tracked through its CVR. Status changes on
                the CVR drive Current Budget; the trend no longer contributes
                to AFC.
              </p>
            </div>
          )}

          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <EntityAuxTabTriggers />
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-3">
              {/* Identity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Labeled label="Trend Number">
                  <Input
                    value={form.trendNumber}
                    placeholder="TR-001"
                    onChange={(e) => update("trendNumber", e.target.value)}
                  />
                </Labeled>
                <Labeled label="Title" className="md:col-span-2">
                  <Input
                    value={form.title}
                    placeholder="One-line summary"
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
                      : "New trends start as Identified."
                  }
                >
                  <div className="flex h-9 items-center">
                    <TrendStatusBadge
                      status={initial ? initial.status : "IDENTIFIED"}
                    />
                  </div>
                </Labeled>
                <Labeled label="Priority">
                  <NativeSelect
                    value={form.priority}
                    onChange={(v) => update("priority", v as TrendPriority)}
                    options={TREND_PRIORITIES.map((s) => ({
                      value: s,
                      label: TREND_PRIORITY_LABELS[s],
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
                <Labeled label="Needed by">
                  <Input
                    type="date"
                    value={toDateInputValue(form.neededBy)}
                    onChange={(e) =>
                      update("neededBy", fromDateInputValue(e.target.value))
                    }
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
                  entityNoun="Trend"
                  onSuccess={closeDialog}
                />
              )}

              {/* Forecast math */}
              <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Forecast
                </legend>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Labeled
                    label="Probability (%)"
                    help="0–100. Drives AFC weight."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(form.probability * 100)}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        update(
                          "probability",
                          Number.isFinite(n)
                            ? Math.min(100, Math.max(0, n)) / 100
                            : 0,
                        );
                      }}
                    />
                  </Labeled>
                  <Labeled label="Cost — likely" help="Drives AFC math.">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={form.costLikely}
                      onChange={(e) =>
                        update("costLikely", parseFloat(e.target.value) || 0)
                      }
                    />
                  </Labeled>
                  <Labeled label="Cost — low" help="Best case. Display only.">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={form.costLow}
                      onChange={(e) =>
                        update("costLow", parseFloat(e.target.value) || 0)
                      }
                    />
                  </Labeled>
                  <Labeled label="Cost — high" help="Worst case. Display only.">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={form.costHigh}
                      onChange={(e) =>
                        update("costHigh", parseFloat(e.target.value) || 0)
                      }
                    />
                  </Labeled>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <Labeled label="Schedule impact (days)">
                    <Input
                      type="number"
                      step={1}
                      value={form.scheduleDaysImpact}
                      onChange={(e) =>
                        update(
                          "scheduleDaysImpact",
                          parseInt(e.target.value, 10) || 0,
                        )
                      }
                    />
                  </Labeled>
                  <div className="md:col-span-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
                      AFC contribution
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-amber-900">
                      {formatMoney(previewContribution)}
                    </div>
                    <div className="text-xs text-amber-800">
                      {Math.round(form.probability * 100)}% ×{" "}
                      {formatMoney(form.costLikely)} — folded into AFC while
                      this trend is Identified or Probable.
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* Field context */}
              <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Context
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
                          label: a.name
                            ? `${a.displayId} — ${a.name}`
                            : a.displayId,
                        })),
                      ]}
                    />
                  </Labeled>
                  <Labeled label="Initiated by">
                    <Input
                      value={form.initiatedBy}
                      placeholder="PM / PE / superintendent"
                      onChange={(e) => update("initiatedBy", e.target.value)}
                    />
                  </Labeled>
                  <Labeled label="Identified at">
                    <Input
                      type="date"
                      value={toDateInputValue(form.identifiedAt)}
                      onChange={(e) => {
                        const iso = fromDateInputValue(e.target.value);
                        if (iso) update("identifiedAt", iso);
                      }}
                    />
                  </Labeled>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Labeled
                    label="Linked RFI"
                    help="Optional. Use when this trend tracks the cost risk on an open RFI."
                  >
                    <NativeSelect
                      value={
                        form.linkedRfiId === null ? "" : String(form.linkedRfiId)
                      }
                      onChange={(v) =>
                        update("linkedRfiId", v === "" ? null : Number(v))
                      }
                      options={[
                        { value: "", label: "— None —" },
                        ...rfiList.map((r) => ({
                          value: String(r.id),
                          label: `${r.rfiNumber || `RFI #${r.id}`} — ${r.subject}`,
                        })),
                      ]}
                    />
                  </Labeled>
                  <Labeled
                    label="Linked FCO"
                    help="Optional. Use when this trend tracks the cost risk on an in-flight FCO."
                  >
                    <NativeSelect
                      value={
                        form.linkedFcoId === null ? "" : String(form.linkedFcoId)
                      }
                      onChange={(v) =>
                        update("linkedFcoId", v === "" ? null : Number(v))
                      }
                      options={[
                        { value: "", label: "— None —" },
                        ...fcoList.map((f) => ({
                          value: String(f.id),
                          label: `${f.fcoNumber || `FCO #${f.id}`} — ${f.title}`,
                        })),
                      ]}
                    />
                  </Labeled>
                </div>
              </fieldset>

              <Labeled label="Description">
                <Textarea
                  value={form.description}
                  rows={3}
                  placeholder="What's the trend, what's driving it"
                  onChange={(e) => update("description", e.target.value)}
                />
              </Labeled>

              <Labeled label="Reason narrative">
                <Textarea
                  value={form.reasonNarrative}
                  rows={3}
                  placeholder="Why we think this will land — assumptions, references"
                  onChange={(e) => update("reasonNarrative", e.target.value)}
                />
              </Labeled>

              <Labeled
                label="Affected CBS codes"
                help="Search and select one or more CBS items. The first code's digit drives bucket attribution for AFC."
              >
                <SearchableMultiSelect
                  values={form.cbsCodes}
                  onChange={(values) => update("cbsCodes", values)}
                  options={cbsOptions}
                  placeholder="Type to search CBS codes…"
                />
              </Labeled>

              <Labeled label="Notes">
                <Textarea
                  value={form.notes}
                  rows={2}
                  placeholder="Internal notes — escalations, follow-ups"
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Labeled>
            </TabsContent>

            <EntityAuxTabPanels
              entityType="Trend"
              entityId={initial?.id ?? null}
              projectId={initial?.projectId ?? null}
            />
          </Tabs>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={busy || projectId === null}
              onClick={() => handleSubmit()}
            >
              {busy ? "Saving…" : initial ? "Save" : "Create"}
            </Button>
          </div>
      </div>
    </>
  );
}

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, Trash2, X } from "lucide-react";
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
import {
  CHANGE_TYPES,
  RISK_LEVELS,
  changeLogQueryOptions,
  type ChangeLogDetail,
  type ChangeLogListItem,
  type ChangeType,
  type RiskLevel,
  type UpsertChangeLogInput,
} from "~/utils/changelog";
import {
  CVR_COST_TYPES,
  CVR_COST_TYPE_LABELS,
  lineItemTotal,
  makeBlankLineItem,
  mergeAffectedCbsCodes,
  sumLineItems,
  type CvrCostType,
  type CvrLineItemDto,
} from "~/utils/cvrLineItems";
import { formatMoney } from "~/lib/formatting";
import { CVR_TRANSITIONS, availableTransitions } from "~/utils/workflow";
import { useCurrentUser } from "~/lib/use-current-user";
import { disciplines } from "~/config/disciplines";
import {
  RISK_LABELS,
  StatusBadge,
  TYPE_LABELS,
} from "~/components/Changelog/StatusBadge";
import { WorkflowActions } from "~/components/WorkflowActions";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "~/components/SearchableSelect";
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
import { useFormDialog } from "~/lib/use-form-dialog";
import { useSelectedProject } from "~/lib/selected-project";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { TemplatePicker } from "~/components/EntityDialog/TemplatePicker";
import {
  cvrTemplatePickerQueryOptions,
  instantiateCvrTemplate,
  saveAsCvrTemplate,
  type CvrTemplateFieldSet,
} from "~/utils/cvrTemplates";
import { useIsAdmin } from "~/lib/use-current-user";
import { invalidateAdminEntity } from "~/lib/admin-invalidations";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

type FormState = Omit<UpsertChangeLogInput, "projectId">;

function blankForm(): FormState {
  return {
    cvrNumber: "",
    title: "",
    description: "",
    status: "REQUESTED",
    type: "SCOPE",
    discipline: "",
    cbsCodes: [],
    originator: "",
    costImpact: 0,
    scheduleDaysImpact: 0,
    laborHoursImpact: 0,
    riskLevel: "MEDIUM",
    reasonCode: "",
    requestedAt: new Date().toISOString(),
    dueDate: null,
    approvedAt: null,
    approver: "",
    notes: "",
    area: "",
    lineItems: [],
  };
}

function fromItem(item: ChangeLogDetail): FormState {
  return {
    id: item.id,
    cvrNumber: item.cvrNumber,
    title: item.title,
    description: item.description,
    status: item.status,
    type: item.type,
    discipline: item.discipline,
    cbsCodes: item.cbsCodes,
    originator: item.originator,
    costImpact: item.costImpact,
    scheduleDaysImpact: item.scheduleDaysImpact,
    laborHoursImpact: item.laborHoursImpact,
    riskLevel: item.riskLevel,
    reasonCode: item.reasonCode,
    requestedAt: item.requestedAt,
    dueDate: item.dueDate,
    approvedAt: item.approvedAt,
    approver: item.approver,
    notes: item.notes,
    area: item.area,
    lineItems: item.lineItems,
  };
}

type ChangelogDialogProps = {
  trigger: React.ReactNode;
  /** Slim list-item shape; dialog lazy-fetches the full record on open. */
  initial?: ChangeLogListItem;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  /**
   * Run a workflow status transition. Only meaningful in edit mode; the dialog
   * renders one button per transition allowed by the current user's role and
   * originator status. See `CVR_TRANSITIONS` in workflow.ts.
   */
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
};

export function ChangelogDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
  onTransition,
}: ChangelogDialogProps) {
  return (
    <EntityDialogShell
      trigger={trigger}
      initial={initial}
      fullQueryOptions={changeLogQueryOptions}
      loadingLabel="Loading change item…"
      // Fixed-height flex column so the dialog stays the same size on every
      // tab — only the tab panel scrolls; the header and footer are pinned.
      contentClassName="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,1100px)] h-[85vh] flex flex-col overflow-hidden"
    >
      {(full, closeDialog) => (
        <ChangelogDialogBody
          initial={full}
          onSubmit={onSubmit}
          onDelete={onDelete}
          onTransition={onTransition}
          closeDialog={closeDialog}
        />
      )}
    </EntityDialogShell>
  );
}

function ChangelogDialogBody({
  initial,
  onSubmit,
  onDelete,
  onTransition,
  closeDialog,
}: {
  initial?: ChangeLogDetail;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
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
  } = useFormDialog<ChangeLogDetail, FormState>({
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
      `Delete change item "${i.title}"? This cannot be undone.`,
  });

  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();

  /** Fold a template's field set into the current draft. Status/dates and
   *  identity (id, cvrNumber) stay on whatever the user already entered —
   *  the template only knows the 13 templatable columns. */
  function applyTemplate(t: CvrTemplateFieldSet) {
    setForm((f) => ({
      ...f,
      title: t.title || f.title,
      description: t.description || f.description,
      type: t.type,
      discipline: t.discipline || f.discipline,
      cbsCodes: t.cbsCodes.length > 0 ? t.cbsCodes : f.cbsCodes,
      originator: t.originator || f.originator,
      costImpact: t.costImpact,
      scheduleDaysImpact: t.scheduleDaysImpact,
      laborHoursImpact: t.laborHoursImpact,
      riskLevel: t.riskLevel,
      reasonCode: t.reasonCode || f.reasonCode,
      notes: t.notes || f.notes,
      area: t.area || f.area,
    }));
  }

  async function handleSaveAsTemplate() {
    const name = window.prompt(
      "Name this template (shown in the picker — e.g. 'Weather Delay'):",
    );
    if (!name || !name.trim()) return;
    const templateDescription =
      window.prompt(
        "Optional description shown beside the name in the picker:",
        "",
      ) ?? "";
    setBusy(true);
    try {
      await saveAsCvrTemplate({
        data: {
          name: name.trim(),
          templateDescription,
          title: form.title,
          description: form.description,
          type: form.type,
          discipline: form.discipline,
          cbsCodes: form.cbsCodes,
          originator: form.originator,
          costImpact: form.costImpact,
          scheduleDaysImpact: form.scheduleDaysImpact,
          laborHoursImpact: form.laborHoursImpact,
          riskLevel: form.riskLevel,
          reasonCode: form.reasonCode,
          notes: form.notes,
          area: form.area,
        },
      });
      invalidateAdminEntity(queryClient, "cvrTemplates");
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
          CVR_TRANSITIONS,
          initial.status,
          currentUser.role,
          isOriginator,
        )
      : [];

  // `open` is implicitly true — only mounted when outer is open + full loaded.
  const cbsOptions: SearchableSelectOption[] = useCbsSearchableOptions();

  // Areas for the selected project — populates the Area dropdown. CVRs may
  // be project-wide, so "— None —" is the default. Legacy rows that pre-date
  // this field default to "" and naturally land on "— None —".
  const { projectId } = useSelectedProject();
  const { data: areas = [] } = useQuery({
    ...areasByProjectQueryOptions(projectId),
    enabled: projectId !== null,
  });
  // `busy` doesn't reset when the outer toggles open; that's fine because
  // mutation completion already sets it back to false in useFormDialog.
  void setBusy;

  // Cost buildup. With ≥1 line, `costImpact` is the sum of line totals and the
  // manual Cost Impact field goes read-only. Keep `form.costImpact` synced so
  // template-save and the submit payload carry the rolled-up number (the
  // server recomputes it authoritatively regardless).
  const hasLineItems = form.lineItems.length > 0;
  const derivedCost = React.useMemo(
    () => sumLineItems(form.lineItems),
    [form.lineItems],
  );
  React.useEffect(() => {
    if (!hasLineItems) return;
    setForm((f) =>
      f.costImpact === derivedCost ? f : { ...f, costImpact: derivedCost },
    );
  }, [hasLineItems, derivedCost, setForm]);

  // Live-merge buildup CBS codes into Affected CBS Codes so the chips appear as
  // the user assigns a code on a line. Additive only — the merge never removes
  // a manually-chosen code, and the length guard avoids a render loop (merge
  // only ever grows the list). Depends on `form.lineItems`; the resulting
  // `cbsCodes` update doesn't retrigger it.
  React.useEffect(() => {
    setForm((f) => {
      const merged = mergeAffectedCbsCodes(f.cbsCodes, f.lineItems);
      return merged.length === f.cbsCodes.length
        ? f
        : { ...f, cbsCodes: merged };
    });
  }, [form.lineItems, setForm]);

  const addLine = () =>
    setForm((f) => ({
      ...f,
      lineItems: [...f.lineItems, makeBlankLineItem(f.lineItems.length)],
    }));
  const updateLine = (index: number, patch: Partial<CvrLineItemDto>) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((li, i) =>
        i === index ? { ...li, ...patch } : li,
      ),
    }));
  const removeLine = (index: number) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.filter((_, i) => i !== index),
    }));

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-2 pr-8 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Change Item" : "New Change Item"}
              </h2>
              <p className="text-xs text-slate-500">
                Track a CVR or scope change with cost, schedule, and CBS impact
              </p>
            </div>
            <div className="flex items-center gap-2">
              {initial?.id && (
                <a
                  href={`/cvr-print/${initial.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  title="Open the printable / PDF version in a new tab"
                >
                  <Printer className="size-3.5" />
                  Print / PDF
                </a>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsTemplate}
                  disabled={busy || !form.title.trim()}
                  title="Snapshot the current form as a new CVR template"
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

          <Tabs
            defaultValue="details"
            className="w-full flex-1 flex flex-col min-h-0"
          >
            <TabsList className="shrink-0">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="buildup">
                Cost Buildup
                {hasLineItems ? ` (${form.lineItems.length})` : ""}
              </TabsTrigger>
              <EntityAuxTabTriggers />
            </TabsList>
            {/* Single scroll region shared by every panel — its fixed flex
                height is what keeps the dialog from resizing per tab. */}
            <div className="flex-1 min-h-0 overflow-y-auto">
            <TabsContent value="details" className="space-y-4 mt-3">

          {!initial && (
            <TemplatePicker<CvrTemplateFieldSet>
              pickerQueryOptions={cvrTemplatePickerQueryOptions}
              instantiate={instantiateCvrTemplate}
              currentDiscipline={form.discipline}
              onSelect={applyTemplate}
              noun="CVR"
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Labeled label="CVR Number">
              <Input
                value={form.cvrNumber}
                placeholder="CVR-001"
                onChange={(e) => update("cvrNumber", e.target.value)}
              />
            </Labeled>
            <Labeled label="Title">
              <Input
                value={form.title}
                placeholder="Short description"
                onChange={(e) => update("title", e.target.value)}
              />
            </Labeled>
          </div>

          <Labeled label="Description">
            <Textarea
              value={form.description}
              placeholder="What is being changed and why"
              rows={3}
              onChange={(e) => update("description", e.target.value)}
            />
          </Labeled>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Labeled
              label="Status"
              help={
                initial
                  ? "Use the workflow actions below to advance status."
                  : "New items start as Requested."
              }
            >
              <div className="flex h-9 items-center">
                <StatusBadge status={initial ? initial.status : "REQUESTED"} />
              </div>
            </Labeled>
            <Labeled label="Type">
              <NativeSelect
                value={form.type}
                onChange={(v) => update("type", v as ChangeType)}
                options={CHANGE_TYPES.map((s) => ({
                  value: s,
                  label: TYPE_LABELS[s],
                }))}
              />
            </Labeled>
            <Labeled label="Risk">
              <NativeSelect
                value={form.riskLevel}
                onChange={(v) => update("riskLevel", v as RiskLevel)}
                options={RISK_LEVELS.map((s) => ({
                  value: s,
                  label: RISK_LABELS[s],
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
              entityNoun="CVR"
              onSuccess={closeDialog}
            />
          )}

          <Labeled
            label="Area"
            help={
              projectId === null
                ? "Select a project first."
                : areas.length === 0
                  ? "No areas defined. Optional — leave as None for project-wide changes."
                  : "Optional — leave as None for project-wide changes."
            }
          >
            <NativeSelect
              value={form.area}
              onChange={(v) => update("area", v)}
              options={[
                { value: "", label: "— None (project-wide) —" },
                ...areas.map((a) => ({
                  value: String(a.id),
                  label: a.name ? `${a.displayId} — ${a.name}` : a.displayId,
                })),
              ]}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled
              label="Cost Impact ($)"
              help={
                hasLineItems
                  ? "Derived from the Cost Buildup tab."
                  : undefined
              }
            >
              {hasLineItems ? (
                <Input
                  type="text"
                  readOnly
                  value={`$${formatMoney(derivedCost)}`}
                  className="bg-slate-50 text-slate-600"
                  title="Edit the Cost Buildup tab to change this."
                />
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  value={form.costImpact}
                  onChange={(e) =>
                    update("costImpact", parseFloat(e.target.value) || 0)
                  }
                />
              )}
            </Labeled>
            <Labeled label="Schedule Impact (days)">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled label="Originator">
              <Input
                value={form.originator}
                placeholder="Requesting party"
                onChange={(e) => update("originator", e.target.value)}
              />
            </Labeled>
            <Labeled label="Approver">
              <Input
                value={form.approver}
                placeholder="Approving party"
                onChange={(e) => update("approver", e.target.value)}
              />
            </Labeled>
            <Labeled label="Reason Code">
              <Input
                value={form.reasonCode}
                placeholder="e.g. OWNER_REQUEST, SITE_CONDITION"
                onChange={(e) => update("reasonCode", e.target.value)}
              />
            </Labeled>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled label="Requested Date">
              <Input
                type="date"
                value={toDateInputValue(form.requestedAt)}
                onChange={(e) =>
                  update(
                    "requestedAt",
                    fromDateInputValue(e.target.value) ??
                      new Date().toISOString(),
                  )
                }
              />
            </Labeled>
            <Labeled label="Due Date">
              <Input
                type="date"
                value={toDateInputValue(form.dueDate)}
                onChange={(e) =>
                  update("dueDate", fromDateInputValue(e.target.value))
                }
              />
            </Labeled>
            <Labeled label="Approved Date">
              <Input
                type="date"
                value={toDateInputValue(form.approvedAt)}
                onChange={(e) =>
                  update("approvedAt", fromDateInputValue(e.target.value))
                }
              />
            </Labeled>
          </div>

          <Labeled label="Notes">
            <Textarea
              value={form.notes}
              rows={2}
              placeholder="Internal notes, links, references"
              onChange={(e) => update("notes", e.target.value)}
            />
          </Labeled>

            </TabsContent>
            <TabsContent value="buildup" className="mt-3">
              <CostBuildupEditor
                lines={form.lineItems}
                derivedCost={derivedCost}
                cbsOptions={cbsOptions}
                onAdd={addLine}
                onUpdate={updateLine}
                onRemove={removeLine}
              />
            </TabsContent>
            <EntityAuxTabPanels
              entityType="ChangeLog"
              entityId={initial?.id ?? null}
              projectId={initial?.projectId ?? null}
            />
            </div>
          </Tabs>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 shrink-0">
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
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
      </div>
    </>
  );
}

function CostBuildupEditor({
  lines,
  derivedCost,
  cbsOptions,
  onAdd,
  onUpdate,
  onRemove,
}: {
  lines: CvrLineItemDto[];
  derivedCost: number;
  cbsOptions: SearchableSelectOption[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<CvrLineItemDto>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Build the cost impact from labor, material, equipment and sub lines —
        each is quantity × unit rate. The subtotal becomes the CVR's Cost
        Impact. Leave empty to enter Cost Impact by hand on the Details tab.
      </p>

      {lines.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No cost lines yet.
        </div>
      ) : (
        // No overflow wrapper: the per-row CBS SearchableSelect opens an
        // absolutely-positioned dropdown that an `overflow` ancestor would
        // clip. The dialog itself is wide enough for the columns.
        <div className="rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 w-56">CBS Item</th>
                <th className="px-2 py-2 w-32">Cost Type</th>
                <th className="px-2 py-2 w-20 text-right">Qty</th>
                <th className="px-2 py-2 w-20">Unit</th>
                <th className="px-2 py-2 w-28 text-right">Unit Rate</th>
                <th className="px-2 py-2 w-28 text-right">Line Total</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((li, i) => (
                <tr
                  key={li.id ?? `new-${i}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-2 py-1.5">
                    <Input
                      value={li.description}
                      placeholder="What this covers"
                      onChange={(e) =>
                        onUpdate(i, { description: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <SearchableSelect
                      value={li.cbsCode}
                      options={cbsOptions}
                      placeholder="— CBS item —"
                      onSelect={(v) => onUpdate(i, { cbsCode: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <NativeSelect
                      value={li.costType}
                      onChange={(v) =>
                        onUpdate(i, { costType: v as CvrCostType })
                      }
                      options={CVR_COST_TYPES.map((c) => ({
                        value: c,
                        label: CVR_COST_TYPE_LABELS[c],
                      }))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="any"
                      className="text-right"
                      value={li.quantity}
                      onChange={(e) =>
                        onUpdate(i, {
                          quantity: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={li.unit}
                      placeholder="hr, ea, ls"
                      onChange={(e) => onUpdate(i, { unit: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="any"
                      className="text-right"
                      value={li.unitRate}
                      onChange={(e) =>
                        onUpdate(i, {
                          unitRate: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                    ${formatMoney(lineItemTotal(li))}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      aria-label="Remove line"
                      className="text-slate-400 hover:text-red-600"
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-2 py-2 text-slate-600" colSpan={6}>
                  Subtotal — Cost Impact
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                  ${formatMoney(derivedCost)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="size-4 mr-1" />
        Add line
      </Button>
    </div>
  );
}


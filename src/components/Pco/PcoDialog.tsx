import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { EntityDialogShell } from "~/components/EntityDialog/EntityDialogShell";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Checkbox } from "~/components/ui/checkbox";
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import {
  PCO_PRIORITIES,
  pcoEligibleCvrsQueryOptions,
  pcoQueryOptions,
  type PcoItem,
  type PcoListItem,
  type PcoPriority,
  type UpsertPcoInput,
} from "~/utils/pco";
import { PCO_TRANSITIONS, availableTransitions } from "~/utils/workflow";
import { useCurrentUser } from "~/lib/use-current-user";
import { useRecordRecentView } from "~/lib/use-record-recent-view";
import { WorkflowActions } from "~/components/WorkflowActions";
import { PCO_PRIORITY_LABELS } from "~/utils/pcoLabels";
import { PcoStatusBadge } from "~/components/Pco/PcoBadges";
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

type FormState = Omit<UpsertPcoInput, "projectId">;

function blankForm(): FormState {
  return {
    pcoNumber: "",
    ownerReference: "",
    title: "",
    description: "",
    priority: "NORMAL",
    requestedAmount: 0,
    approvedAmount: 0,
    scheduleDaysImpact: 0,
    ownerRepName: "",
    ownerRepEmail: "",
    reasonNarrative: "",
    notes: "",
    invoiceNumber: "",
    initiatedBy: "",
    linkedCvrIds: [],
  };
}

function fromItem(item: PcoItem): FormState {
  return {
    id: item.id,
    pcoNumber: item.pcoNumber,
    ownerReference: item.ownerReference,
    title: item.title,
    description: item.description,
    priority: item.priority,
    requestedAmount: item.requestedAmount,
    approvedAmount: item.approvedAmount,
    scheduleDaysImpact: item.scheduleDaysImpact,
    ownerRepName: item.ownerRepName,
    ownerRepEmail: item.ownerRepEmail,
    reasonNarrative: item.reasonNarrative,
    notes: item.notes,
    invoiceNumber: item.invoiceNumber,
    initiatedBy: item.initiatedBy,
    linkedCvrIds: item.linkedCvrs.map((c) => c.id),
  };
}

type PcoDialogProps = {
  trigger: React.ReactNode;
  /** Slim list-item shape. Dialog lazy-fetches the full record on open. */
  initial?: PcoListItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
};

export function PcoDialog({
  trigger,
  initial,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
}: PcoDialogProps) {
  return (
    <EntityDialogShell
      trigger={trigger}
      initial={initial}
      fullQueryOptions={pcoQueryOptions}
      loadingLabel="Loading PCO…"
    >
      {(full, closeDialog) => (
        <PcoDialogBody
          initial={full}
          projectId={projectId}
          onSubmit={onSubmit}
          onDelete={onDelete}
          onTransition={onTransition}
          closeDialog={closeDialog}
        />
      )}
    </EntityDialogShell>
  );
}

function PcoDialogBody({
  initial,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
  closeDialog,
}: {
  initial?: PcoItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
  closeDialog: () => void;
}) {
  const {
    form,
    busy,
    setBusy,
    update,
    handleSubmit,
    handleDelete,
  } = useFormDialog<PcoItem, FormState>({
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
      `Delete PCO "${i.title}"? Linked CVRs will be detached (not deleted).`,
  });

  // Record this open in the user's "Recently viewed".
  useRecordRecentView(
    initial
      ? {
          entityType: "Pco",
          entityId: initial.id,
          projectId: initial.projectId,
          number: initial.pcoNumber,
          title: initial.title,
        }
      : null,
  );

  const { data: currentUser } = useCurrentUser();
  const isOriginator =
    !!currentUser &&
    initial?.createdById !== null &&
    initial?.createdById === currentUser?.id;
  const transitions =
    initial && currentUser && onTransition
      ? availableTransitions(
          PCO_TRANSITIONS,
          initial.status,
          currentUser.role,
          isOriginator,
        )
      : [];

  const { data: eligibleCvrs = [] } = useQuery({
    ...pcoEligibleCvrsQueryOptions(projectId, initial?.id ?? null),
    enabled: projectId !== null,
  });

  // Sum of selected CVRs' costImpact. Used as a one-click "set requested
  // to internal cost" helper — the user can also override directly.
  const selectedCvrTotal = React.useMemo(() => {
    const selected = new Set(form.linkedCvrIds);
    return eligibleCvrs
      .filter((c) => selected.has(c.id))
      .reduce((sum, c) => sum + c.costImpact, 0);
  }, [form.linkedCvrIds, eligibleCvrs]);

  function toggleCvr(cvrId: number, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...form.linkedCvrIds, cvrId]))
      : form.linkedCvrIds.filter((id) => id !== cvrId);
    update("linkedCvrIds", next);
  }

  const requestedMargin =
    selectedCvrTotal > 0 ? form.requestedAmount - selectedCvrTotal : 0;
  const approvedMargin =
    selectedCvrTotal > 0 ? form.approvedAmount - selectedCvrTotal : 0;

  return (
    <>
      <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit PCO" : "New PCO"}
              </h2>
              <p className="text-xs text-slate-500">
                Prime / Owner Change Order — what the EPC is billing the
                owner for. Bundle one or more approved CVRs and track the
                negotiation through to payment.
              </p>
            </div>
            <div className="flex items-center gap-2">
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

          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="cvrs">
                CVRs ({form.linkedCvrIds.length})
              </TabsTrigger>
              <EntityAuxTabTriggers />
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Labeled label="PCO Number">
                  <Input
                    value={form.pcoNumber}
                    placeholder="PCO-001"
                    onChange={(e) => update("pcoNumber", e.target.value)}
                  />
                </Labeled>
                <Labeled
                  label="Owner reference"
                  help="The owner's CO# / COR# on their side, when known."
                >
                  <Input
                    value={form.ownerReference}
                    placeholder="OWNER-CO-12"
                    onChange={(e) => update("ownerReference", e.target.value)}
                  />
                </Labeled>
                <Labeled label="Title" className="md:col-span-3">
                  <Input
                    value={form.title}
                    placeholder="One-line summary"
                    onChange={(e) => update("title", e.target.value)}
                  />
                </Labeled>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Labeled
                  label="Status"
                  help={
                    initial
                      ? "Use the workflow actions below to advance status."
                      : "New PCOs start as Draft."
                  }
                >
                  <div className="flex h-9 items-center">
                    <PcoStatusBadge
                      status={initial ? initial.status : "DRAFT"}
                    />
                  </div>
                </Labeled>
                <Labeled label="Priority">
                  <NativeSelect
                    value={form.priority}
                    onChange={(v) => update("priority", v as PcoPriority)}
                    options={PCO_PRIORITIES.map((s) => ({
                      value: s,
                      label: PCO_PRIORITY_LABELS[s],
                    }))}
                  />
                </Labeled>
                <Labeled label="Schedule extension (days)">
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
                <Labeled label="Initiated by">
                  <Input
                    value={form.initiatedBy}
                    placeholder="PM / commercial mgr"
                    onChange={(e) => update("initiatedBy", e.target.value)}
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
                  entityNoun="PCO"
                  onSuccess={closeDialog}
                />
              )}

              <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pricing
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Labeled
                    label="Requested amount"
                    help="What the EPC is asking the owner to pay."
                  >
                    <Input
                      type="number"
                      step={100}
                      value={form.requestedAmount}
                      onChange={(e) =>
                        update(
                          "requestedAmount",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </Labeled>
                  <Labeled
                    label="Approved amount"
                    help="What the owner agreed to. Defaults to requested when first approved."
                  >
                    <Input
                      type="number"
                      step={100}
                      value={form.approvedAmount}
                      onChange={(e) =>
                        update(
                          "approvedAmount",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </Labeled>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Linked CVR cost
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-slate-800">
                      {formatMoney(selectedCvrTotal)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Sum of selected CVR costImpact. Click "Set" beside an
                      amount to copy.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() =>
                        update("requestedAmount", selectedCvrTotal)
                      }
                      disabled={selectedCvrTotal === 0}
                    >
                      Set requested = CVR cost
                    </Button>
                    {selectedCvrTotal > 0 && (
                      <span
                        className={
                          requestedMargin >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }
                      >
                        Margin: {formatMoney(requestedMargin)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => update("approvedAmount", selectedCvrTotal)}
                      disabled={selectedCvrTotal === 0}
                    >
                      Set approved = CVR cost
                    </Button>
                    {selectedCvrTotal > 0 && form.approvedAmount > 0 && (
                      <span
                        className={
                          approvedMargin >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }
                      >
                        Realized: {formatMoney(approvedMargin)}
                      </span>
                    )}
                  </div>
                </div>
              </fieldset>

              <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Owner contact
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Labeled label="Owner rep name">
                    <Input
                      value={form.ownerRepName}
                      placeholder="Project Owner Rep"
                      onChange={(e) => update("ownerRepName", e.target.value)}
                    />
                  </Labeled>
                  <Labeled label="Owner rep email">
                    <Input
                      type="email"
                      value={form.ownerRepEmail}
                      placeholder="rep@owner.example"
                      onChange={(e) => update("ownerRepEmail", e.target.value)}
                    />
                  </Labeled>
                </div>
              </fieldset>

              {/* Invoice strip — only shows once the PCO has been approved. */}
              {initial &&
                (initial.status === "APPROVED" ||
                  initial.status === "INVOICED" ||
                  initial.status === "CLOSED") && (
                  <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Billing
                    </legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Labeled label="Invoice number">
                        <Input
                          value={form.invoiceNumber}
                          placeholder="AR-2026-042"
                          onChange={(e) =>
                            update("invoiceNumber", e.target.value)
                          }
                        />
                      </Labeled>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Invoiced at
                        </p>
                        <p className="text-sm text-slate-700">
                          {initial.invoicedAt
                            ? new Date(initial.invoicedAt).toLocaleDateString()
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Paid at
                        </p>
                        <p className="text-sm text-slate-700">
                          {initial.paidAt
                            ? new Date(initial.paidAt).toLocaleDateString()
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </fieldset>
                )}

              <Labeled label="Description">
                <Textarea
                  value={form.description}
                  rows={3}
                  placeholder="What's bundled into this PCO and why"
                  onChange={(e) => update("description", e.target.value)}
                />
              </Labeled>

              <Labeled
                label="Reason narrative"
                help="The owner-facing justification — often pasted into the PCO PDF."
              >
                <Textarea
                  value={form.reasonNarrative}
                  rows={3}
                  placeholder="Why the owner is being asked to pay this"
                  onChange={(e) => update("reasonNarrative", e.target.value)}
                />
              </Labeled>

              <Labeled label="Internal notes">
                <Textarea
                  value={form.notes}
                  rows={2}
                  placeholder="Negotiation strategy, escalations, follow-ups"
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Labeled>
            </TabsContent>

            <TabsContent value="cvrs" className="space-y-3 mt-3">
              <p className="text-xs text-slate-500">
                Only APPROVED or EXECUTED CVRs from this project are
                eligible. CVRs already attached to a different PCO are
                hidden. Linking a CVR doesn't change its status; saving
                stamps the link both ways.
              </p>
              {eligibleCvrs.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  No eligible CVRs on this project yet.
                </p>
              ) : (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-1 text-left w-10"></th>
                        <th className="px-2 py-1 text-left">CVR #</th>
                        <th className="px-2 py-1 text-left">Title</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        <th className="px-2 py-1 text-right">Cost impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleCvrs.map((c) => {
                        const checked = form.linkedCvrIds.includes(c.id);
                        return (
                          <tr
                            key={c.id}
                            className="border-t border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-2 py-1.5">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  toggleCvr(c.id, v === true)
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5 font-mono text-xs text-slate-700">
                              {c.cvrNumber || `CVR #${c.id}`}
                            </td>
                            <td className="px-2 py-1.5 text-slate-800">
                              {c.title}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-slate-600">
                              {c.status}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                              {formatMoney(c.costImpact)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <EntityAuxTabPanels
              entityType="Pco"
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

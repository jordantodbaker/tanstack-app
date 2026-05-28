import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Link as LinkIcon, Printer, Trash2 } from "lucide-react";
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
  RFI_PRIORITIES,
  rfiQueryOptions,
  type RfiItem,
  type RfiListItem,
  type RfiPriority,
  type UpsertRfiInput,
} from "~/utils/rfis";
import { RFI_TRANSITIONS, availableTransitions } from "~/utils/workflow";
import { useCurrentUser } from "~/lib/use-current-user";
import { WorkflowActions } from "~/components/WorkflowActions";
import { disciplines } from "~/config/disciplines";
import {
  RFI_PRIORITY_LABELS,
} from "~/utils/rfiLabels";
import { RfiStatusBadge } from "~/components/Rfi/RfiBadges";
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
import { Attachments } from "~/components/Attachments";
import { Comments } from "~/components/Comments";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

type FormState = Omit<UpsertRfiInput, "projectId">;

function blankForm(): FormState {
  return {
    rfiNumber: "",
    subject: "",
    question: "",
    priority: "NORMAL",
    discipline: "",
    cbsCodes: [],
    locationArea: "",
    drawingRefs: [],
    specRefs: [],
    suspectsCostImpact: false,
    suspectsScheduleImpact: false,
    initiatedBy: "",
    assignedTo: "",
    dueDate: null,
    initiatedAt: new Date().toISOString(),
    response: "",
    answeredBy: "",
  };
}

function fromItem(item: RfiItem): FormState {
  return {
    id: item.id,
    rfiNumber: item.rfiNumber,
    subject: item.subject,
    question: item.question,
    priority: item.priority,
    discipline: item.discipline,
    cbsCodes: item.cbsCodes,
    locationArea: item.locationArea,
    drawingRefs: item.drawingRefs,
    specRefs: item.specRefs,
    suspectsCostImpact: item.suspectsCostImpact,
    suspectsScheduleImpact: item.suspectsScheduleImpact,
    initiatedBy: item.initiatedBy,
    assignedTo: item.assignedTo,
    dueDate: item.dueDate,
    initiatedAt: item.initiatedAt,
    response: item.response,
    answeredBy: item.answeredBy,
  };
}

type RfiDialogProps = {
  trigger: React.ReactNode;
  /** Slim list-item shape. The dialog lazy-fetches the full record on open
   *  so heavy text fields (`question`, `response`) populate correctly. */
  initial?: RfiListItem;
  projectId: number | null;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  /**
   * Run a workflow transition. Renders one button per transition allowed by
   * the current user's role + originator status. See `RFI_TRANSITIONS`.
   */
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
  /**
   * Promote this RFI to a new FCO. Pre-populates the FCO from the RFI's
   * discipline / area / drawings and links it back via `linkedRfiId`.
   */
  onPromote?: (id: number) => Promise<unknown>;
};

/**
 * Outer wrapper. Owns the Dialog open state and runs the lazy full-record
 * fetch in edit mode. Inner `RfiDialogBody` only mounts once the full data
 * is ready, so its `useFormDialog` seeds the form with complete heavy-text
 * fields on first render.
 */
export function RfiDialog({
  trigger,
  initial: initialSlim,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
}: RfiDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEdit = initialSlim?.id !== undefined;
  const { data: full } = useQuery({
    ...rfiQueryOptions(isEdit ? (initialSlim?.id ?? null) : null),
    enabled: open && isEdit,
  });
  const fullReady = !isEdit || !!full;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,1000px)] max-h-[90vh] overflow-y-auto">
        {!open ? null : !fullReady ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading RFI…
          </div>
        ) : (
          <RfiDialogBody
            key={initialSlim?.id ?? "new"}
            initial={full ?? undefined}
            projectId={projectId}
            onSubmit={onSubmit}
            onDelete={onDelete}
            onTransition={onTransition}
            onPromote={onPromote}
            closeDialog={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RfiDialogBody({
  initial,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
  closeDialog,
}: {
  initial?: RfiItem;
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
  } = useFormDialog<RfiItem, FormState>({
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
    deleteConfirm: (i) => `Delete RFI "${i.subject}"? This cannot be undone.`,
  });

  async function handlePromote() {
    if (!initial?.id || !onPromote) return;
    if (
      !confirm(
        "Promote this RFI to a new FCO? The FCO will be pre-populated with the RFI's discipline, area, and drawings, and linked back to this RFI.",
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

  // Promotion is allowed once the RFI is anything but VOID. One RFI can
  // spawn multiple FCOs; no uniqueness gate.
  const canPromote =
    initial && initial.status !== "VOID" && onPromote && projectId !== null;

  const { data: currentUser } = useCurrentUser();
  const isOriginator =
    !!currentUser &&
    initial?.createdById !== null &&
    initial?.createdById === currentUser?.id;
  const transitions =
    initial && currentUser && onTransition
      ? availableTransitions(
          RFI_TRANSITIONS,
          initial.status,
          currentUser.role,
          isOriginator,
        )
      : [];

  // `open` is implicitly true — this component only mounts when the outer
  // dialog is open and the full record has loaded.
  const { data: cbsCodeOptions = [] } = useQuery(cbsCodeOptionsQueryOptions());
  const { data: areas = [] } = useQuery({
    ...areasByProjectQueryOptions(projectId),
    enabled: projectId !== null,
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

  // Comma-separated text fields for the string-array columns. Commit on
  // blur so the user can type freely without per-keystroke parsing churn.
  const [drawingRefsText, setDrawingRefsText] = React.useState("");
  const [specRefsText, setSpecRefsText] = React.useState("");
  React.useEffect(() => {
    setDrawingRefsText(form.drawingRefs.join(", "));
    setSpecRefsText(form.specRefs.join(", "));
  }, [form.drawingRefs, form.specRefs]);

  function commitList(raw: string, key: "drawingRefs" | "specRefs") {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    update(key, items);
  }

  return (
    <>
      <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit RFI" : "New RFI"}
              </h2>
              <p className="text-xs text-slate-500">
                Question to the designer/engineer — drawings, specs, field
                conditions. Promote to an FCO if the answer drives new scope.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {initial?.id && (
                <a
                  href={`/rfi-print/${initial.id}`}
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
                  Promote to FCO
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

          {initial && initial.linkedFcos.length > 0 && (
            <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <div className="flex items-center gap-2 font-medium">
                <LinkIcon className="size-4" />
                Promoted to FCO
                {initial.linkedFcos.length > 1 ? "s" : ""}
              </div>
              <ul className="mt-1 space-y-0.5 pl-6 text-violet-800">
                {initial.linkedFcos.map((f) => (
                  <li key={f.id}>
                    <span className="font-mono text-xs">
                      {f.fcoNumber || `FCO #${f.id}`}
                    </span>
                    {f.title && (
                      <span className="text-violet-700"> — {f.title}</span>
                    )}
                  </li>
                ))}
              </ul>
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
              {/* Identity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Labeled label="RFI Number">
                  <Input
                    value={form.rfiNumber}
                    placeholder="RFI-001"
                    onChange={(e) => update("rfiNumber", e.target.value)}
                  />
                </Labeled>
                <Labeled label="Subject" className="md:col-span-2">
                  <Input
                    value={form.subject}
                    placeholder="One-line summary"
                    onChange={(e) => update("subject", e.target.value)}
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
                      : "New RFIs start as Draft."
                  }
                >
                  <div className="flex h-9 items-center">
                    <RfiStatusBadge status={initial ? initial.status : "DRAFT"} />
                  </div>
                </Labeled>
                <Labeled label="Priority">
                  <NativeSelect
                    value={form.priority}
                    onChange={(v) => update("priority", v as RfiPriority)}
                    options={RFI_PRIORITIES.map((s) => ({
                      value: s,
                      label: RFI_PRIORITY_LABELS[s],
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
                <Labeled label="Due date">
                  <Input
                    type="date"
                    value={toDateInputValue(form.dueDate)}
                    onChange={(e) =>
                      update("dueDate", fromDateInputValue(e.target.value))
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
                  entityNoun="RFI"
                  onSuccess={closeDialog}
                />
              )}

              {/* Field context */}
              <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Field context
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
                      placeholder="Foreman / field engineer"
                      onChange={(e) => update("initiatedBy", e.target.value)}
                    />
                  </Labeled>
                  <Labeled
                    label="Assigned to (responder)"
                    help="Free text — usually the EOR or designer."
                  >
                    <Input
                      value={form.assignedTo}
                      placeholder="Engineer of record"
                      onChange={(e) => update("assignedTo", e.target.value)}
                    />
                  </Labeled>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Labeled
                    label="Drawing references"
                    help="Comma-separated (e.g. P-101-A, M-303-B)"
                  >
                    <Input
                      value={drawingRefsText}
                      onChange={(e) => setDrawingRefsText(e.target.value)}
                      onBlur={(e) => commitList(e.target.value, "drawingRefs")}
                      placeholder="P-101-A, M-303-B"
                    />
                  </Labeled>
                  <Labeled
                    label="Spec references"
                    help="Comma-separated spec sections"
                  >
                    <Input
                      value={specRefsText}
                      onChange={(e) => setSpecRefsText(e.target.value)}
                      onBlur={(e) => commitList(e.target.value, "specRefs")}
                      placeholder="03 30 00, 05 12 00"
                    />
                  </Labeled>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={form.suspectsCostImpact}
                      onCheckedChange={(v) =>
                        update("suspectsCostImpact", v === true)
                      }
                    />
                    <span className="font-medium text-slate-700">
                      Cost impact suspected
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={form.suspectsScheduleImpact}
                      onCheckedChange={(v) =>
                        update("suspectsScheduleImpact", v === true)
                      }
                    />
                    <span className="font-medium text-slate-700">
                      Schedule impact suspected
                    </span>
                  </label>
                </div>
              </fieldset>

              {/* Question */}
              <Labeled label="Question">
                <Textarea
                  value={form.question}
                  rows={4}
                  placeholder="What needs to be clarified, and why"
                  onChange={(e) => update("question", e.target.value)}
                />
              </Labeled>

              <Labeled
                label="Affected CBS codes"
                help="Search and select one or more CBS items"
              >
                <SearchableMultiSelect
                  values={form.cbsCodes}
                  onChange={(values) => update("cbsCodes", values)}
                  options={cbsOptions}
                  placeholder="Type to search CBS codes…"
                />
              </Labeled>

              {/* Response side */}
              <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Response
                </legend>
                <Labeled
                  label="Answer"
                  help='Filled in when the responder posts an answer. Use "Post answer" in the workflow actions above to stamp the answered date.'
                >
                  <Textarea
                    value={form.response}
                    rows={4}
                    placeholder="The designer/engineer's response"
                    onChange={(e) => update("response", e.target.value)}
                  />
                </Labeled>
                <Labeled label="Answered by">
                  <Input
                    value={form.answeredBy}
                    placeholder="Responder name"
                    onChange={(e) => update("answeredBy", e.target.value)}
                  />
                </Labeled>
              </fieldset>
            </TabsContent>
            <TabsContent value="attachments" className="mt-3">
              <Attachments
                entityType="Rfi"
                entityId={initial?.id ?? null}
                projectId={initial?.projectId ?? null}
              />
            </TabsContent>
            <TabsContent value="comments" className="mt-3">
              <Comments
                entityType="Rfi"
                entityId={initial?.id ?? null}
                projectId={initial?.projectId ?? null}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-3">
              <AuditTimeline
                entityType="Rfi"
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

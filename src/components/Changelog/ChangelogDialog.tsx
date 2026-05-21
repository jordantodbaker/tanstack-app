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
import {
  Labeled,
  NativeSelect,
  fromDateInputValue,
  toDateInputValue,
} from "~/components/ui/form-helpers";
import {
  CHANGE_STATUSES,
  CHANGE_TYPES,
  RISK_LEVELS,
  type ChangeLogItem,
  type ChangeStatus,
  type ChangeType,
  type RiskLevel,
  type UpsertChangeLogInput,
} from "~/utils/changelog";
import { disciplines } from "~/config/disciplines";
import {
  RISK_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "~/components/Changelog/StatusBadge";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";
import type { SearchableSelectOption } from "~/components/SearchableSelect";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "~/components/ui/tabs";
import { AuditTimeline } from "~/components/AuditTimeline";
import { useFormDialog } from "~/lib/use-form-dialog";
import { useSelectedProject } from "~/lib/selected-project";
import { cbsCodeOptionsQueryOptions } from "~/utils/cbs";
import { areasByProjectQueryOptions } from "~/utils/areas";

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
  };
}

function fromItem(item: ChangeLogItem): FormState {
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
  };
}

export function ChangelogDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: ChangeLogItem;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<ChangeLogItem, FormState>({
      initial,
      blank: blankForm,
      fromItem,
      onSubmit,
      onDelete,
      deleteConfirm: (i) =>
        `Delete change item "${i.title}"? This cannot be undone.`,
    });

  const { data: cbsCodeOptions = [] } = useQuery({
    ...cbsCodeOptionsQueryOptions(),
    enabled: open,
  });

  // Areas for the selected project — populates the Area dropdown. CVRs may
  // be project-wide, so "— None —" is the default. Legacy rows that pre-date
  // this field default to "" and naturally land on "— None —".
  const { projectId } = useSelectedProject();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,1100px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Change Item" : "New Change Item"}
              </h2>
              <p className="text-xs text-slate-500">
                Track a CVR or scope change with cost, schedule, and CBS impact
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

          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-4 mt-3">

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
            <Labeled label="Status">
              <NativeSelect
                value={form.status}
                onChange={(v) => update("status", v as ChangeStatus)}
                options={CHANGE_STATUSES.map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                }))}
              />
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
            <TabsContent value="history" className="mt-3">
              <AuditTimeline
                entityType="ChangeLog"
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
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


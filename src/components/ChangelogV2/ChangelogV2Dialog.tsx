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
import {
  CHANGE_STATUSES,
  CHANGE_TYPES,
  RISK_LEVELS,
  type ChangeLogV2Item,
  type ChangeStatus,
  type ChangeType,
  type RiskLevel,
  type UpsertChangeLogV2Input,
} from "~/utils/changelogV2";
import { disciplines } from "~/config/disciplines";
import {
  RISK_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "~/components/ChangelogV2/StatusBadge";

const DISCIPLINE_OPTIONS = disciplines
  .filter((d) => d.l1Codes && d.l1Codes.length > 0)
  .map((d) => ({ id: d.id, label: d.label }));

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type FormState = Omit<UpsertChangeLogV2Input, "projectId">;

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
  };
}

function fromItem(item: ChangeLogV2Item): FormState {
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
  };
}

export function ChangelogV2Dialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  /** When provided, the dialog opens in edit mode. */
  initial?: ChangeLogV2Item;
  onSubmit: (form: FormState) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(() =>
    initial ? fromItem(initial) : blankForm(),
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(initial ? fromItem(initial) : blankForm());
    }
  }, [open, initial]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const [cbsCodesText, setCbsCodesText] = React.useState("");
  React.useEffect(() => {
    setCbsCodesText(form.cbsCodes.join(", "));
  }, [form.cbsCodes]);

  function commitCbsCodes(raw: string) {
    const codes = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    update("cbsCodes", codes);
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      await onSubmit(form);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id || !onDelete) return;
    if (!confirm(`Delete change item "${initial.title}"? This cannot be undone.`))
      return;
    setBusy(true);
    try {
      await onDelete(initial.id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

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
            label="Affected CBS Codes"
            help="Comma-separated displayCodes (e.g. 612-00-0000-00-C, 612-00-0000-00-L)"
          >
            <Input
              value={cbsCodesText}
              onChange={(e) => setCbsCodesText(e.target.value)}
              onBlur={(e) => commitCbsCodes(e.target.value)}
              placeholder="612-00-0000-00-C, 632-00-0000-00-L"
            />
            {form.cbsCodes.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {form.cbsCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
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

function Labeled({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </span>
      {children}
      {help && <span className="mt-0.5 block text-xs text-slate-400">{help}</span>}
    </label>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs/relaxed"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Camera, Pencil, Trash2 } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import {
  createSnapshot,
  deleteSnapshot,
  snapshotDetailQueryOptions,
  snapshotsQueryOptions,
  updateSnapshot,
  type EstimateSnapshotItem,
} from "~/utils/snapshots";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import type { ProjectFefRowTotals } from "~/lib/project-totals";
import {
  cvTone,
  formatCurrency,
  formatMoney,
  formatSignedCurrency,
  type SemanticTone,
} from "~/lib/formatting";
import { useCurrentUser, useIsAdmin } from "~/lib/use-current-user";
import { QueryError } from "~/components/ui/list-page";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Labeled } from "~/components/ui/form-helpers";

/**
 * "Snapshots" panel for the Summary page. Lists frozen estimate captures for
 * the current project, lets the user create new ones, view their totals, and
 * delete their own.
 */
export function SnapshotsSection() {
  const { projectId } = useSelectedProject();
  const {
    data: snapshots = [],
    isPending,
    isError,
    error,
  } = useQuery(snapshotsQueryOptions(projectId));

  if (projectId === null) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Camera className="size-5 text-slate-500" />
            Snapshots
          </h2>
          <p className="text-xs text-slate-500">
            Freeze the current estimate (FEF rows + Basis) at a point in time
            for later comparison. Inputs are frozen; totals are recomputed on
            view from the same aggregator the live Summary uses.
          </p>
        </div>
        <CreateSnapshotDialog projectId={projectId} />
      </div>
      {isError ? (
        <QueryError error={error} label="snapshots" />
      ) : isPending ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : snapshots.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          No snapshots yet. Click <span className="font-medium">Create
          snapshot</span> to capture the current estimate.
        </p>
      ) : (
        <SnapshotList snapshots={snapshots} />
      )}
    </section>
  );
}

function SnapshotList({
  snapshots,
}: {
  snapshots: EstimateSnapshotItem[];
}) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Label</th>
            <th className="px-3 py-2 text-left">Notes</th>
            <th className="px-3 py-2 text-right">Rows</th>
            <th className="px-3 py-2 text-left">Created by</th>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <SnapshotRow key={s.id} snapshot={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotRow({
  snapshot,
}: {
  snapshot: EstimateSnapshotItem;
}) {
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = useIsAdmin();
  const isCreator = currentUser?.email === snapshot.createdByEmail;
  const canManage = isAdmin || isCreator;

  const remove = useMutation({
    mutationFn: (id: number) => deleteSnapshot({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", projectId] });
    },
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete snapshot "${snapshot.label}"? This can't be undone.`)) {
      return;
    }
    remove.mutate(snapshot.id);
  }

  return (
    <SnapshotDetailDialog snapshotId={snapshot.id}>
      <tr className="cursor-pointer hover:bg-slate-50 border-t border-slate-100">
        <td className="px-3 py-2 font-medium text-slate-800">
          {snapshot.label}
        </td>
        <td className="px-3 py-2 text-slate-600 truncate max-w-xs">
          {snapshot.notes || "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
          {snapshot.rowCount}
        </td>
        <td className="px-3 py-2 text-slate-600">
          {snapshot.createdByEmail ?? "—"}
        </td>
        <td className="px-3 py-2 text-slate-600">
          {new Date(snapshot.createdAt).toLocaleString()}
        </td>
        <td className="px-3 py-2 text-right">
          {canManage && (
            <div className="flex items-center justify-end gap-1">
              <EditSnapshotDialog snapshot={snapshot} />
              <button
                type="button"
                onClick={handleDelete}
                disabled={remove.isPending}
                title="Delete snapshot"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 inline-flex h-7 w-7 items-center justify-center rounded-md"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>
    </SnapshotDetailDialog>
  );
}

function CreateSnapshotDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () =>
      createSnapshot({
        data: { projectId, label: label.trim(), notes: notes.trim() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", projectId] });
      setOpen(false);
      setLabel("");
      setNotes("");
    },
  });

  function handleCreate() {
    if (!label.trim()) return;
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Camera className="size-3.5 mr-1" />
          Create snapshot
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              Create snapshot
            </h2>
            <p className="text-xs text-slate-500">
              Freezes every FEF row and the project Basis as they are now.
              Once saved, the snapshot's inputs can't be edited.
            </p>
          </div>
          <Labeled label="Label" help='e.g. "As-bid 2026-04-15" or "Rev 2 after RFI-042"'>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="As-bid"
              maxLength={120}
            />
          </Labeled>
          <Labeled label="Notes" help="Optional. Context for why this snapshot was taken.">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Submitted to owner for review…"
            />
          </Labeled>
          {create.isError && (
            <p className="text-xs text-red-600">
              {create.error instanceof Error
                ? create.error.message
                : "Could not create snapshot."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={create.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={create.isPending || !label.trim()}
            >
              {create.isPending ? "Saving…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditSnapshotDialog({ snapshot }: { snapshot: EstimateSnapshotItem }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(snapshot.label);
  const [notes, setNotes] = React.useState(snapshot.notes);
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();

  // Re-seed from the latest snapshot each time the dialog opens, so a stale
  // draft from a prior open doesn't linger.
  React.useEffect(() => {
    if (open) {
      setLabel(snapshot.label);
      setNotes(snapshot.notes);
    }
  }, [open, snapshot.label, snapshot.notes]);

  const update = useMutation({
    mutationFn: () =>
      updateSnapshot({
        data: { id: snapshot.id, label: label.trim(), notes: notes.trim() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", projectId] });
      // Detail cache has `staleTime: Infinity`, so it must be busted explicitly
      // or a reopened detail dialog would show the old label/notes.
      queryClient.invalidateQueries({ queryKey: ["snapshot", snapshot.id] });
      setOpen(false);
    },
  });

  function handleSave() {
    if (!label.trim()) return;
    update.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          // Stop the click bubbling to the row, which is itself the trigger for
          // the snapshot detail dialog.
          onClick={(e) => e.stopPropagation()}
          title="Edit label & notes"
          className="text-slate-500 hover:bg-slate-100 hover:text-slate-700 inline-flex h-7 w-7 items-center justify-center rounded-md"
        >
          <Pencil className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              Edit snapshot
            </h2>
            <p className="text-xs text-slate-500">
              Update the label and notes. The captured estimate (FEF rows +
              Basis) stays frozen.
            </p>
          </div>
          <Labeled
            label="Label"
            help='e.g. "As-bid 2026-04-15" or "Rev 2 after RFI-042"'
          >
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="As-bid"
              maxLength={120}
            />
          </Labeled>
          <Labeled
            label="Notes"
            help="Optional. Context for why this snapshot was taken."
          >
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Submitted to owner for review…"
            />
          </Labeled>
          {update.isError && (
            <p className="text-xs text-red-600">
              {update.error instanceof Error
                ? update.error.message
                : "Could not update snapshot."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button
                variant="outline"
                type="button"
                disabled={update.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSave}
              disabled={update.isPending || !label.trim()}
            >
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotDetailDialog({
  snapshotId,
  children,
}: {
  snapshotId: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const {
    data: detail,
    isPending,
    isError,
    error,
  } = useQuery({
    ...snapshotDetailQueryOptions(open ? snapshotId : null),
    enabled: open,
  });
  // Live totals for the snapshot's project — drives the variance columns.
  // Gated on the snapshot loading first so we know the projectId without
  // depending on the page's `useSelectedProject` (snapshots may be viewed
  // for a project other than the currently-selected one in some flows).
  const { data: liveTotals } = useQuery({
    ...projectFefRowTotalsQueryOptions(detail?.projectId ?? null),
    enabled: open && detail != null,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          {isError ? (
            <QueryError error={error} label="snapshot" />
          ) : isPending || !detail ? (
            <p className="text-sm text-slate-500">Loading snapshot…</p>
          ) : (
            <SnapshotDetailBody
              label={detail.label}
              notes={detail.notes}
              rowCount={detail.rowCount}
              createdByEmail={detail.createdByEmail}
              createdAt={detail.createdAt}
              basisInputs={detail.basisInputs}
              totals={detail.totals}
              liveTotals={liveTotals ?? null}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotDetailBody({
  label,
  notes,
  rowCount,
  createdByEmail,
  createdAt,
  basisInputs,
  totals,
  liveTotals,
}: {
  label: string;
  notes: string;
  rowCount: number;
  createdByEmail: string | null;
  createdAt: string;
  basisInputs: import("~/utils/snapshots").EstimateSnapshotBasis | null;
  totals: ProjectFefRowTotals;
  /** Current live totals for the snapshot's project; null while loading. */
  liveTotals: ProjectFefRowTotals | null;
}) {
  const digits = Array.from(
    new Set([
      ...Object.keys(totals.laborByDigit),
      ...Object.keys(totals.materialsByDigit),
      ...Object.keys(totals.laborHoursByDigit),
      ...Object.keys(liveTotals?.laborByDigit ?? {}),
      ...Object.keys(liveTotals?.materialsByDigit ?? {}),
      ...Object.keys(liveTotals?.laborHoursByDigit ?? {}),
    ]),
  ).sort();

  const snapTotalLabor = sumValues(totals.laborByDigit);
  const snapTotalMaterials = sumValues(totals.materialsByDigit);
  const snapInvalid = sumValues(totals.invalidByDiscipline);
  const liveTotalLabor = liveTotals ? sumValues(liveTotals.laborByDigit) : null;
  const liveTotalMaterials = liveTotals
    ? sumValues(liveTotals.materialsByDigit)
    : null;
  const liveInvalid = liveTotals
    ? sumValues(liveTotals.invalidByDiscipline)
    : null;

  return (
    <>
      <div className="pr-8">
        <h2 className="text-lg font-semibold text-slate-800">{label}</h2>
        <p className="text-xs text-slate-500">
          {createdByEmail ?? "Unknown user"} ·{" "}
          {new Date(createdAt).toLocaleString()} · {rowCount} rows
        </p>
        {notes && (
          <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
            {notes}
          </p>
        )}
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Headline — snapshot vs. current
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VarianceStat
            label="Total labor"
            snapshot={snapTotalLabor}
            current={liveTotalLabor}
            asMoney
          />
          <VarianceStat
            label="Total materials"
            snapshot={snapTotalMaterials}
            current={liveTotalMaterials}
            asMoney
          />
          <VarianceStat
            label="Craft support labor"
            snapshot={totals.craftSupportLabor}
            current={liveTotals?.craftSupportLabor ?? null}
            asMoney
          />
          <VarianceStat
            label="Invalid TO rows"
            snapshot={snapInvalid}
            current={liveInvalid}
            // Increases in invalid rows are bad — flip the sense so the
            // delta colors match user intent (more invalid = red).
            invertColor
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          By digit — snapshot · current · Δ
        </legend>
        {digits.length === 0 ? (
          <p className="text-xs text-slate-500">No totals to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th
                    rowSpan={2}
                    className="px-2 py-1 text-left align-bottom"
                  >
                    Digit
                  </th>
                  <th colSpan={3} className="px-2 py-1 text-center">
                    Labor $
                  </th>
                  <th colSpan={3} className="px-2 py-1 text-center">
                    Labor hrs
                  </th>
                  <th colSpan={3} className="px-2 py-1 text-center">
                    Materials $
                  </th>
                </tr>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                  <th className="px-2 py-1 text-right">Snap</th>
                  <th className="px-2 py-1 text-right">Now</th>
                  <th className="px-2 py-1 text-right">Δ</th>
                  <th className="px-2 py-1 text-right">Snap</th>
                  <th className="px-2 py-1 text-right">Now</th>
                  <th className="px-2 py-1 text-right">Δ</th>
                  <th className="px-2 py-1 text-right">Snap</th>
                  <th className="px-2 py-1 text-right">Now</th>
                  <th className="px-2 py-1 text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {digits.map((d) => (
                  <DigitVarianceRow
                    key={d}
                    digit={d}
                    snapLabor={totals.laborByDigit[d] ?? 0}
                    liveLabor={liveTotals?.laborByDigit[d] ?? null}
                    snapHours={totals.laborHoursByDigit[d] ?? 0}
                    liveHours={liveTotals?.laborHoursByDigit[d] ?? null}
                    snapMat={totals.materialsByDigit[d] ?? 0}
                    liveMat={liveTotals?.materialsByDigit[d] ?? null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>

      {basisInputs && (
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Basis at snapshot time
          </legend>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat
              label="Estimate factor"
              value={basisInputs.estimateFactor || "—"}
            />
            <Stat
              label="Composite labor rate"
              value={basisInputs.compositeLaborRate || "—"}
            />
          </div>
        </fieldset>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-slate-200">
        <DialogClose asChild>
          <Button variant="outline" type="button">
            Close
          </Button>
        </DialogClose>
      </div>
    </>
  );
}

function sumValues(map: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(map)) n += v;
  return n;
}

/**
 * Side-by-side metric card with snapshot value, current value, and the delta.
 * `invertColor` flips the green/red mapping for metrics where "up" is bad
 * (e.g. invalid row count). When `current` is null, renders only the snapshot
 * value with a small "loading" hint.
 */
function VarianceStat({
  label,
  snapshot,
  current,
  asMoney = false,
  invertColor = false,
}: {
  label: string;
  snapshot: number;
  current: number | null;
  asMoney?: boolean;
  invertColor?: boolean;
}) {
  const fmtValue = (n: number) =>
    asMoney ? formatCurrency(n) : String(n);
  const fmtSignedValue = (n: number) =>
    asMoney
      ? formatSignedCurrency(n)
      : `${n > 0 ? "+" : ""}${n}`;
  const delta = current === null ? null : current - snapshot;
  const pct =
    current === null || snapshot === 0 ? null : (delta! / snapshot) * 100;
  // `cvTone` treats positive as good (green) by default; flip for metrics
  // where positive is bad (e.g. invalid-row count). Zero stays neutral.
  const baseTone = delta === null ? "slate" : cvTone(delta);
  const deltaTone: SemanticTone =
    invertColor && baseTone !== "slate"
      ? baseTone === "green"
        ? "red"
        : "green"
      : baseTone;

  return (
    <div className="rounded border border-slate-200 p-2 bg-slate-50/40">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-[10px] uppercase text-slate-400">Snap</p>
          <p className="tabular-nums font-medium text-slate-700">
            {fmtValue(snapshot)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-400">Now</p>
          <p className="tabular-nums font-medium text-slate-800">
            {current === null ? "…" : fmtValue(current)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-400">Δ</p>
          <p className={`tabular-nums font-semibold ${TONE_TEXT[deltaTone]}`}>
            {delta === null
              ? "—"
              : `${fmtSignedValue(delta)}${
                  pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""
                }`}
          </p>
        </div>
      </div>
    </div>
  );
}

// CSS shades for the semantic tones from `~/lib/formatting`. Uses slate-500
// (rather than slate-800) for the neutral tone because the variance table
// is dense and zero deltas shouldn't pop visually.
const TONE_TEXT: Record<SemanticTone, string> = {
  slate: "text-slate-500",
  green: "text-emerald-700",
  red: "text-red-700",
};

function DigitVarianceRow({
  digit,
  snapLabor,
  liveLabor,
  snapHours,
  liveHours,
  snapMat,
  liveMat,
}: {
  digit: string;
  snapLabor: number;
  liveLabor: number | null;
  snapHours: number;
  liveHours: number | null;
  snapMat: number;
  liveMat: number | null;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-1 font-mono text-slate-700">{digit}</td>
      <DeltaCell snapshot={snapLabor} current={liveLabor} asMoney />
      <DeltaCell snapshot={snapHours} current={liveHours} />
      <DeltaCell snapshot={snapMat} current={liveMat} asMoney />
    </tr>
  );
}

/** Renders three cells: snapshot, current, delta. Used inside DigitVarianceRow. */
function DeltaCell({
  snapshot,
  current,
  asMoney = false,
}: {
  snapshot: number;
  current: number | null;
  asMoney?: boolean;
}) {
  // Zero values render as "—" in this dense table so the eye lands on what
  // actually moved. Non-money column (labor hours) uses the raw `formatMoney`
  // for the decimal-comma display.
  const fmt = (n: number) => {
    if (n === 0) return "—";
    return asMoney ? formatCurrency(n) : formatMoney(n);
  };
  const delta = current === null ? null : current - snapshot;
  const tone: SemanticTone = delta === null ? "slate" : cvTone(delta);
  const fmtDelta = (n: number) =>
    asMoney
      ? formatSignedCurrency(n)
      : `${n > 0 ? "+" : ""}${formatMoney(n)}`;
  return (
    <>
      <td className="px-2 py-1 text-right tabular-nums text-slate-500">
        {fmt(snapshot)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-slate-700">
        {current === null ? "…" : fmt(current)}
      </td>
      <td
        className={`px-2 py-1 text-right tabular-nums font-medium ${TONE_TEXT[tone]}`}
      >
        {delta === null || delta === 0 ? "—" : fmtDelta(delta)}
      </td>
    </>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "red";
}) {
  const toneClass = tone === "red" ? "text-red-700" : "text-slate-800";
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

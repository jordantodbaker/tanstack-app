import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { LineChart, Plus, Trash2 } from "lucide-react";
import { qk } from "~/lib/query-keys";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Labeled,
  NativeSelect,
  fromDateInputValue,
  toDateInputValue,
} from "~/components/ui/form-helpers";
import { useSelectedProject } from "~/lib/selected-project";
import {
  createReportingPeriod,
  deleteReportingPeriod,
  evmTimeSeriesQueryOptions,
  periodWithEvmQueryOptions,
  reportingPeriodsQueryOptions,
  upsertMeasurement,
  type PeriodBucketRow,
  type PeriodWithEvm,
} from "~/utils/reporting";
import { EvmSCurve } from "~/components/EvmSCurve";
import { snapshotsQueryOptions } from "~/utils/snapshots";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { useCurrentUser, useIsAdmin } from "~/lib/use-current-user";
import {
  cvTone,
  formatCurrency,
  formatRatio,
  formatSignedCurrency,
  indexTone,
  type SemanticTone,
} from "~/lib/formatting";
import { TableEmptyState } from "~/components/ui/list-page";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";
import type { EvmMetrics } from "~/lib/evm";

export const Route = createFileRoute("/reporting")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      // Both queries are independent — prefetch in parallel.
      await Promise.all([
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            reportingPeriodsQueryOptions(projectId),
          ),
        ),
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            evmTimeSeriesQueryOptions(projectId),
          ),
        ),
      ]);
    }
  },
  component: ReportingPage,
});

function ReportingPage() {
  const { projectId } = useSelectedProject();
  const { data: periods = [] } = useQuery(
    reportingPeriodsQueryOptions(projectId),
  );
  // Default the selected period to the latest (first in desc list).
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (selectedId === null && periods.length > 0) {
      setSelectedId(periods[0].id);
    }
    if (
      selectedId !== null &&
      !periods.some((p) => p.id === selectedId)
    ) {
      // Selected period was deleted — reset to the next-latest.
      setSelectedId(periods[0]?.id ?? null);
    }
  }, [periods, selectedId]);

  return (
    <main className="p-4 max-w-7xl space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LineChart className="size-6 text-red-700" />
            Project Reporting
          </h1>
          <p className="text-sm text-slate-500">
            Earned-value periods: measure progress against a baseline snapshot,
            roll up CPI/SPI/EAC across discipline buckets.
          </p>
        </div>
        {projectId !== null && <NewPeriodDialog projectId={projectId} />}
      </div>

      {projectId === null ? (
        <SelectProjectBanner>
          Select a project from the header to manage reporting periods.
        </SelectProjectBanner>
      ) : periods.length === 0 ? (
        <TableEmptyState message="No reporting periods yet. Click New Period to create one." />
      ) : (
        <>
          <EvmSCurve />
          <PeriodPicker
            periods={periods}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selectedId !== null && (
            <PeriodDetail key={selectedId} periodId={selectedId} />
          )}
        </>
      )}
    </main>
  );
}

function PeriodPicker({
  periods,
  selectedId,
  onSelect,
}: {
  periods: Array<{
    id: number;
    label: string;
    dataDate: string;
    baselineLabel: string;
    measurementCount: number;
  }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              active
                ? "border-red-700 bg-red-50 text-red-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <div className="font-medium">{p.label}</div>
            <div className="text-xs text-slate-500">
              {new Date(p.dataDate).toLocaleDateString()} ·{" "}
              {p.baselineLabel} · {p.measurementCount} measurements
            </div>
          </button>
        );
      })}
    </div>
  );
}

function NewPeriodDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [dataDate, setDataDate] = React.useState(toDateInputValue(new Date().toISOString()));
  const [snapshotId, setSnapshotId] = React.useState<string>("");
  const queryClient = useQueryClient();
  const { data: snapshots = [] } = useQuery({
    ...snapshotsQueryOptions(projectId),
    enabled: open,
  });

  // Default the snapshot select to the latest one once the list arrives.
  React.useEffect(() => {
    if (open && snapshotId === "" && snapshots.length > 0) {
      setSnapshotId(String(snapshots[0].id));
    }
  }, [open, snapshots, snapshotId]);

  const create = useMutation({
    mutationFn: () => {
      const iso = fromDateInputValue(dataDate);
      if (!iso) throw new Error("Pick a data date.");
      if (!snapshotId) throw new Error("Pick a baseline snapshot.");
      return createReportingPeriod({
        data: {
          projectId,
          label: label.trim(),
          dataDate: iso,
          baselineSnapshotId: Number(snapshotId),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.reporting.periods(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.evmTimeSeries(projectId),
      });
      setOpen(false);
      setLabel("");
      setDataDate(toDateInputValue(new Date().toISOString()));
    },
  });

  const canSubmit = label.trim() !== "" && dataDate !== "" && snapshotId !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5 mr-1" />
          New Period
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              New Reporting Period
            </h2>
            <p className="text-xs text-slate-500">
              Locks a baseline snapshot to a data date so EVM math stays
              consistent across this period's measurements.
            </p>
          </div>
          <Labeled label="Label" help='e.g. "April 2026" or "WE 2026-04-15"'>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="April 2026"
              maxLength={120}
            />
          </Labeled>
          <Labeled label="Data date">
            <Input
              type="date"
              value={dataDate}
              onChange={(e) => setDataDate(e.target.value)}
            />
          </Labeled>
          <Labeled label="Baseline snapshot">
            {snapshots.length === 0 ? (
              <p className="text-xs text-slate-500">
                No snapshots on this project yet. Create one from the Summary
                page first.
              </p>
            ) : (
              <NativeSelect
                value={snapshotId}
                onChange={setSnapshotId}
                options={snapshots.map((s) => ({
                  value: String(s.id),
                  label: `${s.label} (${new Date(s.createdAt).toLocaleDateString()})`,
                }))}
              />
            )}
          </Labeled>
          {create.isError && (
            <p className="text-xs text-red-600">
              {create.error instanceof Error
                ? create.error.message
                : "Could not create period."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" disabled={create.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => create.mutate()}
              disabled={!canSubmit || create.isPending || snapshots.length === 0}
            >
              {create.isPending ? "Saving…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PeriodDetail({ periodId }: { periodId: number }) {
  const { data: period, isPending, isError, error } = useQuery(
    periodWithEvmQueryOptions(periodId),
  );
  if (isError) {
    return (
      <p className="text-sm text-red-700 rounded border border-red-200 bg-red-50 px-3 py-2">
        Couldn't load period:{" "}
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }
  if (isPending || !period) {
    return <p className="text-sm text-slate-500">Loading period…</p>;
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {period.label}
          </h2>
          <p className="text-xs text-slate-500">
            Data date {new Date(period.dataDate).toLocaleDateString()} ·
            baseline {period.baselineLabel}
            {(!period.projectStartDate || !period.projectEndDate) && (
              <span className="text-amber-700">
                {" · "}Project start/end not set — time-linear PV unavailable
                (set in Admin → Projects)
              </span>
            )}
          </p>
        </div>
        <DeletePeriodButton period={period} />
      </div>

      <EvmTable period={period} />
      <ProjectTotalRow total={period.total} />
    </section>
  );
}

function DeletePeriodButton({ period }: { period: PeriodWithEvm }) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = useIsAdmin();
  const remove = useMutation({
    mutationFn: () => deleteReportingPeriod({ data: { id: period.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.reporting.periods(period.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.latestPeriodWithEvm(period.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.evmTimeSeries(period.projectId),
      });
    },
  });
  // Period creator info isn't on PeriodWithEvm; the list view has it, so we
  // optimistically allow delete for admin only here (creator delete is still
  // available via the list-level UI if added later). For v1 simplicity:
  // admins can delete from this surface, everyone else uses the period list.
  if (!isAdmin) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={remove.isPending}
      onClick={() => {
        if (
          confirm(
            `Delete period "${period.label}"? Measurements will be removed too.`,
          )
        ) {
          remove.mutate();
        }
      }}
      className="text-red-600 hover:bg-red-50"
    >
      <Trash2 className="size-3.5 mr-1" />
      Delete
    </Button>
  );
}

function EvmTable({ period }: { period: PeriodWithEvm }) {
  if (period.buckets.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No buckets to report on. The baseline snapshot has no direct costs and
        no CVRs are attributed to any bucket yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">Bucket</th>
            <th className="px-2 py-1 text-right">BAC</th>
            <th className="px-2 py-1 text-right">CVR Rev</th>
            <th className="px-2 py-1 text-right">Curr. Budget</th>
            <th className="px-2 py-1 text-right" title="Percent complete">% Comp</th>
            <th className="px-2 py-1 text-right">EV</th>
            <th className="px-2 py-1 text-right">AC</th>
            <th className="px-2 py-1 text-right">PV</th>
            <th className="px-2 py-1 text-right">CV</th>
            <th className="px-2 py-1 text-right">SV</th>
            <th className="px-2 py-1 text-right">CPI</th>
            <th className="px-2 py-1 text-right">SPI</th>
            <th className="px-2 py-1 text-right">EAC</th>
            <th className="px-2 py-1 text-right" title="Probability-weighted pending trends">
              Pending
            </th>
            <th
              className="px-2 py-1 text-right"
              title="Anticipated Final Cost = EAC + Pending Trend forecast"
            >
              AFC
            </th>
            <th className="px-2 py-1 text-right">VAC</th>
            <th
              className="px-2 py-1 text-right"
              title="Variance at completion against AFC (after pending changes)"
            >
              VAFC
            </th>
            <th className="px-2 py-1 text-left">Notes</th>
          </tr>
        </thead>
        <tbody>
          {period.buckets.map((b) => (
            <BucketRow
              key={b.bucket}
              periodId={period.id}
              projectId={period.projectId}
              row={b}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BucketRow({
  periodId,
  projectId,
  row,
}: {
  periodId: number;
  projectId: number;
  row: PeriodBucketRow;
}) {
  const queryClient = useQueryClient();
  // Local input state so users can type freely; commits on blur. Initialized
  // from the loaded row; `key={periodId}` in the parent ensures these reset
  // when switching periods.
  const [pctStr, setPctStr] = React.useState(String(row.percentComplete * 100));
  const [acStr, setAcStr] = React.useState(String(row.actualCost));
  const [notes, setNotes] = React.useState(row.notes);
  // Keep local state in sync if the row is invalidated and refetched.
  React.useEffect(() => {
    setPctStr(String(row.percentComplete * 100));
    setAcStr(String(row.actualCost));
    setNotes(row.notes);
  }, [row.percentComplete, row.actualCost, row.notes]);

  const save = useMutation({
    mutationFn: (patch: {
      percentComplete?: number;
      actualCost?: number;
      notes?: string;
    }) =>
      upsertMeasurement({
        data: {
          periodId,
          bucket: row.bucket,
          percentComplete: patch.percentComplete ?? row.percentComplete,
          actualCost: patch.actualCost ?? row.actualCost,
          actualHours: row.actualHours,
          plannedValueOverride: null,
          notes: patch.notes ?? row.notes,
        },
      }),
    onSuccess: () => {
      // Scope every invalidation to this project. The previous unscoped
      // `["reportingPeriods"]` and `["latestPeriodWithEvm"]` keys would
      // refetch every project the signed-in user had open in any tab on
      // every cell save — same shape as the setup.ts over-invalidation bug.
      queryClient.invalidateQueries({
        queryKey: qk.reporting.periodWithEvm(periodId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.periods(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.latestPeriodWithEvm(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.evmTimeSeries(projectId),
      });
    },
  });

  const m = row.metrics;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-1 font-medium text-slate-700">
        {row.disciplineLabel || row.bucket}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">
        {formatCurrency(m.bac)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">
        {m.currentBudget - m.bac !== 0
          ? formatSignedCurrency(m.currentBudget - m.bac)
          : "—"}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">
        {formatCurrency(m.currentBudget)}
      </td>
      <td className="px-2 py-1 text-right">
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={pctStr}
          onChange={(e) => setPctStr(e.target.value)}
          onBlur={() => {
            const pct = parseFloat(pctStr);
            if (!Number.isFinite(pct)) return;
            save.mutate({ percentComplete: pct / 100 });
          }}
          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-sm"
        />
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(m.ev)}</td>
      <td className="px-2 py-1 text-right">
        <input
          type="number"
          min="0"
          step="0.01"
          value={acStr}
          onChange={(e) => setAcStr(e.target.value)}
          onBlur={() => {
            const ac = parseFloat(acStr);
            if (!Number.isFinite(ac)) return;
            save.mutate({ actualCost: ac });
          }}
          className="w-24 rounded border border-slate-200 px-1 py-0.5 text-right text-sm"
        />
      </td>
      <td className="px-2 py-1 text-right tabular-nums" title={`PV source: ${row.pvSource}`}>
        {row.pvSource === "none" ? "—" : formatCurrency(m.pv)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${toneClassCV(m.cv)}`}>
        {formatSignedCurrency(m.cv)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${toneClassCV(m.sv)}`}>
        {row.pvSource === "none" ? "—" : formatSignedCurrency(m.sv)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${toneClassIndex(m.cpi)}`}>
        {formatRatio(m.cpi)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${toneClassIndex(m.spi)}`}>
        {row.pvSource === "none" ? "—" : formatRatio(m.spi)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(m.eac)}</td>
      <td
        className={`px-2 py-1 text-right tabular-nums ${m.pendingTrend > 0 ? "text-amber-700" : "text-slate-400"}`}
      >
        {m.pendingTrend > 0 ? formatCurrency(m.pendingTrend) : "—"}
      </td>
      <td className="px-2 py-1 text-right tabular-nums font-medium">
        {formatCurrency(m.afc)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${toneClassCV(m.vac)}`}>
        {formatSignedCurrency(m.vac)}
      </td>
      <td
        className={`px-2 py-1 text-right tabular-nums ${toneClassCV(m.vafc)}`}
      >
        {formatSignedCurrency(m.vafc)}
      </td>
      <td className="px-2 py-1">
        <Textarea
          rows={1}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== row.notes) save.mutate({ notes });
          }}
          className="text-xs min-h-0 h-7 py-1"
        />
      </td>
    </tr>
  );
}

function ProjectTotalRow({ total }: { total: EvmMetrics }) {
  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Project total
      </div>
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-sm">
        <Stat label="BAC" value={formatCurrency(total.bac)} />
        <Stat label="Curr. Budget" value={formatCurrency(total.currentBudget)} />
        <Stat label="EV" value={formatCurrency(total.ev)} />
        <Stat label="AC" value={formatCurrency(total.ac)} />
        <Stat label="CPI" value={formatRatio(total.cpi)} tone={indexTone(total.cpi)} />
        <Stat label="SPI" value={formatRatio(total.spi)} tone={indexTone(total.spi)} />
        <Stat label="EAC" value={formatCurrency(total.eac)} />
      </div>
      {/* AFC row — separate because it carries different load (it's the
          published forecast PMs hand to owners, not an EVM internal). */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t border-slate-200 pt-3">
        <Stat
          label="Pending trend (P×likely)"
          value={formatCurrency(total.pendingTrend)}
          tone={total.pendingTrend > 0 ? "red" : "slate"}
        />
        <Stat
          label="AFC"
          value={formatCurrency(total.afc)}
          tone={total.pendingTrend > 0 ? "red" : "slate"}
        />
        <Stat
          label="VAFC"
          value={formatSignedCurrency(total.vafc)}
          tone={cvTone(total.vafc)}
        />
      </div>
      <div className="mt-2 text-xs text-slate-500">
        VAC{" "}
        <span className={`font-semibold ${toneClassCV(total.vac)}`}>
          {formatSignedCurrency(total.vac)}
        </span>
        {" · "}CV{" "}
        <span className={toneClassCV(total.cv)}>{formatSignedCurrency(total.cv)}</span>
        {" · "}SV{" "}
        <span className={toneClassCV(total.sv)}>{formatSignedCurrency(total.sv)}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: SemanticTone;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`tabular-nums font-semibold ${TONE[tone]}`}>{value}</p>
    </div>
  );
}

// CSS map for the semantic tones from `~/lib/formatting`. Kept local rather
// than shared because the project total card wants "bold" slate (slate-800);
// other surfaces (e.g. the snapshot variance row) use slate-500 for the same
// semantic tone — same decision, different shade.
const TONE: Record<SemanticTone, string> = {
  slate: "text-slate-800",
  green: "text-emerald-700",
  red: "text-red-700",
};

function toneClassCV(n: number): string {
  return TONE[cvTone(n)];
}
function toneClassIndex(n: number | null): string {
  return TONE[indexTone(n)];
}

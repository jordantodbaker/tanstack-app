import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "~/lib/query-keys";
import { Textarea } from "~/components/ui/textarea";
import {
  upsertMeasurement,
  type PeriodBucketRow,
  type PeriodWithEvm,
} from "~/utils/reporting";
import {
  cvTone,
  formatCurrency,
  formatRatio,
  formatSignedCurrency,
  indexTone,
  type SemanticTone,
} from "~/lib/formatting";
import type { EvmMetrics } from "~/lib/evm";

/*
 * One reporting period's earned-value view: the column glossary, the
 * per-bucket table (where % complete and actuals are entered), and the
 * project-total card under it.
 */

/**
 * Collapsible EVM glossary rendered above the bucket table. Replaces the
 * `title=` tooltips that were on % Comp / Pending / AFC / VAFC headers —
 * those don't surface on touch devices, so on mobile users had no way to
 * learn what the acronyms meant. Native `<details>` for zero JS + keyboard
 * accessibility.
 */
export function EvmGlossary() {
  const terms: Array<[string, string]> = [
    ["BAC", "Budget at Completion — original baseline cost"],
    ["CVR Rev", "CVR-driven revisions to the baseline"],
    ["Curr. Budget", "Current Budget = BAC + CVR Rev"],
    ["% Comp", "Percent complete entered for this bucket this period"],
    ["EV", "Earned Value = % Comp × Current Budget"],
    ["AC", "Actual Cost spent through the data date"],
    ["PV", "Planned Value — what we'd expect to have earned by now"],
    ["CV", "Cost Variance = EV − AC (negative is over budget)"],
    ["SV", "Schedule Variance = EV − PV (negative is behind schedule)"],
    ["CPI", "Cost Performance Index = EV ÷ AC (≥ 1.0 on budget)"],
    ["SPI", "Schedule Performance Index = EV ÷ PV (≥ 1.0 on schedule)"],
    ["EAC", "Estimate at Completion = AC + (Curr. Budget − EV) ÷ CPI"],
    ["Pending", "Probability-weighted forecast from pending Trend records"],
    ["AFC", "Anticipated Final Cost = EAC + Pending Trend forecast"],
    ["VAC", "Variance at Completion = Curr. Budget − EAC"],
    [
      "VAFC",
      "Variance at completion against AFC (after probability-weighted pending changes)",
    ],
  ];
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50 text-sm">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 select-none">
        Column definitions
      </summary>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 px-3 pb-3 text-xs">
        {terms.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="font-semibold text-slate-700 shrink-0 w-20 sm:w-24">
              {k}
            </dt>
            <dd className="text-slate-600">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function EvmTable({ period }: { period: PeriodWithEvm }) {
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
      <table className="w-full min-w-5xl border-collapse text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">Bucket</th>
            <th className="px-2 py-1 text-right">BAC</th>
            <th className="px-2 py-1 text-right">CVR Rev</th>
            <th className="px-2 py-1 text-right">Curr. Budget</th>
            <th className="px-2 py-1 text-right">% Comp</th>
            <th className="px-2 py-1 text-right">EV</th>
            <th className="px-2 py-1 text-right">AC</th>
            <th className="px-2 py-1 text-right">PV</th>
            <th className="px-2 py-1 text-right">CV</th>
            <th className="px-2 py-1 text-right">SV</th>
            <th className="px-2 py-1 text-right">CPI</th>
            <th className="px-2 py-1 text-right">SPI</th>
            <th className="px-2 py-1 text-right">EAC</th>
            <th className="px-2 py-1 text-right">Pending</th>
            <th className="px-2 py-1 text-right">AFC</th>
            <th className="px-2 py-1 text-right">VAC</th>
            <th className="px-2 py-1 text-right">VAFC</th>
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
          className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-sm"
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
          className="w-28 rounded border border-slate-200 px-2 py-1 text-right text-sm"
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

export function ProjectTotalRow({ total }: { total: EvmMetrics }) {
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

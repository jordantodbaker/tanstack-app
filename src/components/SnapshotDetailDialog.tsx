import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  snapshotDetailQueryOptions,
  type EstimateSnapshotBasis,
} from "~/utils/snapshots";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import type { ProjectFefRowTotals } from "~/lib/project-totals";
import {
  cvTone,
  formatCurrency,
  formatMoney,
  formatSignedCurrency,
  formatSignedPercent,
  type SemanticTone,
} from "~/lib/formatting";
import { formatDateTime } from "~/lib/dates";
import { QueryError } from "~/components/ui/list-page";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";

/**
 * One snapshot opened up: its frozen totals beside the live totals of the
 * version it was taken from, by headline and by digit, plus the Basis as it
 * stood. `children` is the trigger — a row of the Snapshots table.
 */
export function SnapshotDetailDialog({
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
  // Live totals for the snapshot's *version* — drives the variance columns
  // ("as-snapshotted vs. that version now"). Gated on the snapshot loading
  // first so we know the versionId. Legacy pre-versioning snapshots have a null
  // versionId, so the live comparison is simply disabled for them.
  const { data: liveTotals } = useQuery({
    ...projectFefRowTotalsQueryOptions(detail?.versionId ?? null),
    enabled: open && detail != null && detail.versionId != null,
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
  basisInputs: EstimateSnapshotBasis | null;
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
          {formatDateTime(createdAt)} · {rowCount} rows
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
                  pct !== null ? ` (${formatSignedPercent(pct)})` : ""
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

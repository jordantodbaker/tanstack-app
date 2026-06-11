/**
 * Pure per-period EVM assembler. Lives here (not in `utils/reporting.ts`)
 * so tests can exercise it without Prisma, and so the inner loop is shared
 * between the single-period read (`fetchPeriodWithEvm`) and the time-series
 * read (`fetchEvmTimeSeries`) — they used to inline the same ~30 lines.
 *
 * Inputs are pre-loaded by the caller. The helper has no I/O — given a
 * baseline snapshot's totals, CVR revisions per bucket, the period's
 * measurements, and the project's date window, it returns the per-bucket
 * EVM rows plus the aggregated project total.
 *
 * Bucket set is the union of all sources (snapshot, revisions, measurements)
 * so a CVR or measurement referencing a discipline not in the snapshot
 * still surfaces rather than being silently dropped.
 */

import {
  aggregateEvm,
  computeEvm,
  timeLinearPv,
  type EvmMetrics,
} from "./evm";

/** Subset of `PeriodMeasurement` the calc actually needs. */
export type PeriodMeasurementInput = {
  bucket: string;
  percentComplete: number;
  actualCost: number;
  actualHours: number | null;
  plannedValueOverride: number | null;
  notes: string;
};

/** Per-bucket result row. Matches `PeriodBucketRow` in reporting.ts; that
 *  module re-exports this type so the server contract stays put. */
export type PeriodBucketRow = {
  bucket: string;
  /** Discipline label for the bucket digit; "" when no discipline matches.
   *  Populated by the caller (not in this pure layer). */
  disciplineLabel: string;
  percentComplete: number;
  actualCost: number;
  actualHours: number | null;
  /** Which input produced the PV used in `metrics`. */
  pvSource: "override" | "time-linear" | "none";
  notes: string;
  metrics: EvmMetrics;
};

export type ComputePeriodEvmInput = {
  /** Baseline BAC per bucket. The caller picks the bucket scheme (discipline
   *  id today) and pre-aggregates the snapshot's totals into it — this pure
   *  layer stays agnostic to both the totals shape and the bucket key. */
  bacByBucket: Record<string, number>;
  /** Sum of APPROVED/EXECUTED CVR cost impacts attributed to each bucket. */
  revisionsByBucket: Record<string, number>;
  /** Probability-weighted pending-trend forecast attributed to each bucket
   *  (IDENTIFIED + PROBABLE only). Optional — when omitted, AFC === EAC. */
  trendForecastByBucket?: Record<string, number>;
  measurements: PeriodMeasurementInput[];
  /** Optional. Drives the time-linear PV fallback when a measurement has
   *  no `plannedValueOverride`. Either bound missing → PV falls back to 0. */
  projectStartDate: Date | string | null;
  projectEndDate: Date | string | null;
  dataDate: Date | string;
};

export function computePeriodEvm(input: ComputePeriodEvmInput): {
  buckets: PeriodBucketRow[];
  total: EvmMetrics;
} {
  const measByBucket = new Map(
    input.measurements.map((m) => [m.bucket, m]),
  );
  const trendForecastByBucket = input.trendForecastByBucket ?? {};
  const buckets = Array.from(
    new Set<string>([
      ...Object.keys(input.bacByBucket),
      ...Object.keys(input.revisionsByBucket),
      ...Object.keys(trendForecastByBucket),
      ...measByBucket.keys(),
    ]),
  ).sort();

  const rows: PeriodBucketRow[] = buckets.map((bucket) => {
    const bac = input.bacByBucket[bucket] ?? 0;
    const meas = measByBucket.get(bucket);

    // PV resolution: explicit override beats time-linear; time-linear
    // requires both project dates. When neither produces a positive value,
    // PV is 0 and `computeEvm` returns SPI null (caller renders "—").
    let pv = 0;
    let pvSource: PeriodBucketRow["pvSource"] = "none";
    if (meas?.plannedValueOverride != null) {
      pv = meas.plannedValueOverride;
      pvSource = "override";
    } else if (input.projectStartDate && input.projectEndDate) {
      pv = timeLinearPv(
        bac,
        input.projectStartDate,
        input.projectEndDate,
        input.dataDate,
      );
      pvSource = pv > 0 ? "time-linear" : "none";
    }

    const metrics = computeEvm({
      bac,
      budgetRevisions: input.revisionsByBucket[bucket] ?? 0,
      percentComplete: meas?.percentComplete ?? 0,
      actualCost: meas?.actualCost ?? 0,
      pv,
      pendingTrendForecast: trendForecastByBucket[bucket] ?? 0,
    });

    return {
      bucket,
      disciplineLabel: "",
      percentComplete: meas?.percentComplete ?? 0,
      actualCost: meas?.actualCost ?? 0,
      actualHours: meas?.actualHours ?? null,
      pvSource,
      notes: meas?.notes ?? "",
      metrics,
    };
  });

  return {
    buckets: rows,
    total: aggregateEvm(rows.map((r) => r.metrics)),
  };
}

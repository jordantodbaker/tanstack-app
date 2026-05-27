/**
 * Pure Earned Value Management math. No Prisma, no React, no DB — just
 * inputs to outputs, so tests cover the edges (zero AC, zero PV, zero BAC)
 * that the dashboard would otherwise NaN on.
 *
 * Conventions
 *   BAC = Budget At Completion (baseline)
 *   currentBudget = BAC + budgetRevisions (post-CVR authorized budget)
 *   PV  = Planned Value (what we should have earned by the data date)
 *   EV  = Earned Value (percentComplete × BAC)
 *   AC  = Actual Cost
 *   CV  = EV − AC      (cost variance; positive = under budget)
 *   SV  = EV − PV      (schedule variance; positive = ahead)
 *   CPI = EV / AC      (cost performance index; > 1 = under budget)
 *   SPI = EV / PV      (schedule performance index; > 1 = ahead)
 *   EAC = BAC / CPI    (classic forecast; falls back to BAC when AC = 0)
 *   ETC = EAC − AC     (estimate to complete)
 *   VAC = currentBudget − EAC  (variance at completion against authorized budget)
 *   AFC = EAC + pendingTrend   (anticipated final cost — EVM forecast plus pending trends)
 *   VAFC = currentBudget − AFC (variance after probability-weighted pending changes)
 */

export type EvmInputs = {
  /** Baseline budget for the bucket (from a snapshot's totals). */
  bac: number;
  /** Sum of APPROVED/EXECUTED CVR cost impacts attributed to the bucket. */
  budgetRevisions: number;
  /** 0..1. Values outside the range are clamped — the calc shouldn't punish a typo. */
  percentComplete: number;
  /** $ actually incurred against the bucket through the data date. */
  actualCost: number;
  /** Planned Value at the data date. Producer may compute time-linearly or accept a manual override. */
  pv: number;
  /**
   * Probability-weighted forecast of pending trends in this bucket
   * (`sum(probability × costLikely)` over IDENTIFIED + PROBABLE trends).
   * Optional so existing callers keep working; defaults to 0 when omitted.
   */
  pendingTrendForecast?: number;
};

export type EvmMetrics = {
  bac: number;
  currentBudget: number;
  ev: number;
  pv: number;
  ac: number;
  cv: number;
  sv: number;
  /** EV / AC. Null when AC = 0 (no actuals → ratio is undefined). */
  cpi: number | null;
  /** EV / PV. Null when PV = 0 (no plan → ratio is undefined). */
  spi: number | null;
  eac: number;
  etc: number;
  vac: number;
  /** Probability-weighted pending-trend forecast for the bucket. 0 when no trends. */
  pendingTrend: number;
  /** Anticipated Final Cost = EAC + pendingTrend. The number a PM publishes
   *  once trends are factored into the EVM forecast. */
  afc: number;
  /** VAC against AFC — variance after pending changes. Negative = over. */
  vafc: number;
};

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Single-bucket EVM. Handles the divide-by-zero cases:
 *   - AC = 0 → CPI is null and EAC defaults to BAC (we have no signal to forecast otherwise).
 *   - PV = 0 → SPI is null (typically means the period is before the bucket's planned start).
 */
export function computeEvm(input: EvmInputs): EvmMetrics {
  const bac = safe(input.bac);
  const budgetRevisions = safe(input.budgetRevisions);
  const currentBudget = bac + budgetRevisions;
  const pct = clamp01(input.percentComplete);
  const ev = bac * pct;
  const pv = safe(input.pv);
  const ac = safe(input.actualCost);

  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac === 0 ? null : ev / ac;
  const spi = pv === 0 ? null : ev / pv;
  // Forecast: BAC / CPI when CPI is meaningful; otherwise no signal yet,
  // so the best estimate is the baseline budget itself.
  const eac = cpi === null || cpi === 0 ? bac : bac / cpi;
  const etc = eac - ac;
  const vac = currentBudget - eac;
  const pendingTrend = safe(input.pendingTrendForecast ?? 0);
  const afc = eac + pendingTrend;
  const vafc = currentBudget - afc;

  return {
    bac,
    currentBudget,
    ev,
    pv,
    ac,
    cv,
    sv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    pendingTrend,
    afc,
    vafc,
  };
}

/**
 * Project-level rollup. Sums the cost-shaped fields across buckets, then
 * recomputes the ratios from the totals — averaging CPI/SPI across buckets
 * would weight a $1K bucket the same as a $1M one, which isn't what users
 * mean by "project CPI."
 */
export function aggregateEvm(perBucket: EvmMetrics[]): EvmMetrics {
  if (perBucket.length === 0) {
    return {
      bac: 0,
      currentBudget: 0,
      ev: 0,
      pv: 0,
      ac: 0,
      cv: 0,
      sv: 0,
      cpi: null,
      spi: null,
      eac: 0,
      etc: 0,
      vac: 0,
      pendingTrend: 0,
      afc: 0,
      vafc: 0,
    };
  }
  const bac = perBucket.reduce((a, m) => a + m.bac, 0);
  const currentBudget = perBucket.reduce((a, m) => a + m.currentBudget, 0);
  const ev = perBucket.reduce((a, m) => a + m.ev, 0);
  const pv = perBucket.reduce((a, m) => a + m.pv, 0);
  const ac = perBucket.reduce((a, m) => a + m.ac, 0);
  const pendingTrend = perBucket.reduce((a, m) => a + m.pendingTrend, 0);
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac === 0 ? null : ev / ac;
  const spi = pv === 0 ? null : ev / pv;
  const eac = cpi === null || cpi === 0 ? bac : bac / cpi;
  const etc = eac - ac;
  const vac = currentBudget - eac;
  const afc = eac + pendingTrend;
  const vafc = currentBudget - afc;
  return {
    bac,
    currentBudget,
    ev,
    pv,
    ac,
    cv,
    sv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    pendingTrend,
    afc,
    vafc,
  };
}

/**
 * Time-linear PV fallback. Returns the fraction `(dataDate − start) / (end − start)`
 * of the bucket's BAC. Clamped to [0, 1]. Returns 0 when either bound is
 * missing — the caller should treat that as "no PV signal" and skip SPI in
 * the UI rather than show a misleading zero.
 *
 * `dataDate` / `start` / `end` are ISO strings or Date objects; non-parseable
 * inputs fall back to 0 rather than NaN.
 */
export function timeLinearPv(
  bac: number,
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  dataDate: Date | string,
): number {
  if (!start || !end) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const nowMs = new Date(dataDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(nowMs)) {
    return 0;
  }
  if (endMs <= startMs) return 0;
  const fraction = (nowMs - startMs) / (endMs - startMs);
  return safe(bac) * clamp01(fraction);
}

import { TREND_ACTIVE_STATUSES, type TrendStatus } from "~/config/entity-enums";

/**
 * What a trend adds to the forecast. Pure, so reporting, the dashboard and
 * the list pages' stat cards share one rule, and the Trend dialog can show
 * a live preview without any server-only code. `utils/trends` re-exports
 * both for its own callers; the DB-fed bucketed roll-up stays in
 * `reporting.ts`.
 */

/** A probability as stored: in [0, 1], with anything unparseable read as 0. */
export function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

/**
 * The AFC contribution from a single trend. Only IDENTIFIED + PROBABLE
 * trends contribute; CONVERTED ones are already in `currentBudget` via the
 * linked CVR, and REJECTED/VOID drop out of the forecast entirely.
 */
export function trendForecastContribution(trend: {
  status: TrendStatus;
  probability: number;
  costLikely: number;
}): number {
  if (!TREND_ACTIVE_STATUSES.includes(trend.status)) return 0;
  const p = clampProbability(trend.probability);
  const cost = Number.isFinite(trend.costLikely) ? trend.costLikely : 0;
  return p * cost;
}

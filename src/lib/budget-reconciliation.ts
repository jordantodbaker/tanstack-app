/**
 * Pure estimate↔change budget reconciliation — the "living budget" chain.
 * Combines the as-bid estimate (BAC), authorized changes (APPROVED/EXECUTED
 * CVRs), and probability-weighted pending Trends into, per bucket + a grand
 * total:
 *
 *   asBid  + approvedChange = currentBudget  + weightedTrend = afc
 *
 * `pendingChange` (open, not-yet-authorized CVRs, at full cost) is carried as a
 * separate exposure band — it does NOT move `currentBudget` (only authorized
 * change does) or `afc` (the probabilistic forecast is the trend mechanism),
 * so it's informational and never double-counts against trends.
 *
 * This is the **actuals-free** budget view shown on the estimate side. It is
 * deliberately distinct from the EVM forecast in `evm.ts`, where
 * `afc = eac + trend` folds in actual-cost performance (CPI). Here there are no
 * actuals: AFC = current authorized budget + weighted pending changes.
 *
 * Bucket-key agnostic — the caller picks the scheme (discipline id or L1 code)
 * and passes pre-bucketed inputs, mirroring `computePeriodEvm`. The key set is
 * the union of all three inputs, so a change or trend hitting an account the
 * estimate doesn't cover still surfaces rather than being dropped.
 */

export type BudgetReconciliationRow = {
  /** Bucket key (discipline id or L1 code); "" on the total row. */
  bucket: string;
  asBid: number;
  /** Net APPROVED/EXECUTED CVR cost (can be negative — credit changes). */
  approvedChange: number;
  /** asBid + approvedChange. */
  currentBudget: number;
  /** Net cost of open (REQUESTED…PENDING_APPROVAL) CVRs at full value — the
   *  approval pipeline. Informational; not in currentBudget or afc. */
  pendingChange: number;
  /** Probability-weighted IDENTIFIED + PROBABLE trend forecast. */
  weightedTrend: number;
  /** currentBudget + weightedTrend. */
  afc: number;
};

export type BudgetReconciliation = {
  byBucket: BudgetReconciliationRow[];
  total: BudgetReconciliationRow;
};

const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

export function computeBudgetReconciliation(input: {
  asBidByBucket: Record<string, number>;
  approvedByBucket: Record<string, number>;
  pendingByBucket?: Record<string, number>;
  trendByBucket?: Record<string, number>;
}): BudgetReconciliation {
  const pendingByBucket = input.pendingByBucket ?? {};
  const trendByBucket = input.trendByBucket ?? {};
  const buckets = Array.from(
    new Set<string>([
      ...Object.keys(input.asBidByBucket),
      ...Object.keys(input.approvedByBucket),
      ...Object.keys(pendingByBucket),
      ...Object.keys(trendByBucket),
    ]),
  ).sort();

  const makeRow = (bucket: string): BudgetReconciliationRow => {
    const asBid = safe(input.asBidByBucket[bucket]);
    const approvedChange = safe(input.approvedByBucket[bucket]);
    const pendingChange = safe(pendingByBucket[bucket]);
    const weightedTrend = safe(trendByBucket[bucket]);
    const currentBudget = asBid + approvedChange;
    return {
      bucket,
      asBid,
      approvedChange,
      currentBudget,
      pendingChange,
      weightedTrend,
      afc: currentBudget + weightedTrend,
    };
  };

  const byBucket = buckets.map(makeRow);
  const total = byBucket.reduce<BudgetReconciliationRow>(
    (acc, r) => ({
      bucket: "",
      asBid: acc.asBid + r.asBid,
      approvedChange: acc.approvedChange + r.approvedChange,
      currentBudget: acc.currentBudget + r.currentBudget,
      pendingChange: acc.pendingChange + r.pendingChange,
      weightedTrend: acc.weightedTrend + r.weightedTrend,
      afc: acc.afc + r.afc,
    }),
    {
      bucket: "",
      asBid: 0,
      approvedChange: 0,
      currentBudget: 0,
      pendingChange: 0,
      weightedTrend: 0,
      afc: 0,
    },
  );

  return { byBucket, total };
}

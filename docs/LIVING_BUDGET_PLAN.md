# Plan — Living Budget (estimate ↔ CVR reconciliation)

Turn the as-bid Field Estimate into a **living control budget** by flowing
approved CVRs (and probability-weighted Trends) back onto it, reconciled by CBS
account, and surface it on the estimate side — not just inside EVM.

```
As-bid estimate (BAC, from a baseline EstimateSnapshot)
  + APPROVED / EXECUTED CVRs        →  Current Budget (revised estimate)
  + probability-weighted Trends     →  Anticipated Final Cost (AFC)
```

## Key finding: most of the math already exists

The EVM reporting path already computes this chain — but **per reporting period**,
**discipline-bucketed**, and only after the EVM setup ceremony:

- `bacByDiscipline(snapshot.totals)` → BAC per discipline — [reporting.ts](../src/utils/reporting.ts)
- `loadRevisionsByBucket(projectId)` → APPROVED/EXECUTED CVR cost per discipline ([reporting.ts:224](../src/utils/reporting.ts#L224))
- `loadTrendForecastByBucket(projectId)` → weighted trends per discipline ([reporting.ts:191](../src/utils/reporting.ts#L191))
- `computePeriodEvm({ bacByBucket, revisionsByBucket, trendForecastByBucket, … })` → the pure per-bucket combine
- Bucket attribution: `resolveCvrBucket` ([cvr-bucket.ts](../src/utils/cvr-bucket.ts)) maps `cbsCodes[0]`'s L1 → discipline.

So the work is mostly **(a) lift the reconciliation out of the period-gated path
into an always-on project-level view, (b) refine granularity to L1 / line-item,
(c) present it on the Summary page, (d) make the CVR↔estimate link visible** —
less greenfield than it sounds.

## Decisions to lock before building

1. **Baseline = a chosen `EstimateSnapshot`** (the "as-bid"), defaulting to the
   most recent one; fall back to the live estimate when no snapshot exists. The
   live working estimate is shown as a separate column so a PM sees as-bid vs.
   working vs. current-budget.
2. **"Committed change" = APPROVED + EXECUTED CVRs** (matches the existing EVM
   definition). REQUESTED/IN_REVIEW/PENDING are *not* in current budget;
   surface them separately as "pending" if wanted (phase 4).
3. **Granularity: discipline + L1 (3-char parent CBS)** in v1 — both sides
   already expose L1 (`ProjectFefRowTotals.laborByL1`/`materialsByL1`; CVR via
   `cbsCodes[0].slice(0,3)`). Full-CBS-code is phase 5.
4. **Where it lives:** a new section on the **Summary** page
   ([summary.tsx](../src/routes/summary.tsx)), not a new route.

## Phases

### Phase 1 — Granularity-agnostic reconciliation core ✅ DONE
Pure budget chain in [budget-reconciliation.ts](../src/lib/budget-reconciliation.ts):
`computeBudgetReconciliation({ asBidByBucket, approvedByBucket, trendByBucket })`
→ `{ byBucket: BudgetReconciliationRow[], total }`.

**Deviation from the original plan:** I did *not* extract this out of
`computePeriodEvm`. On reading the code, the EVM forecast uses
`afc = eac + trend` (folds in CPI/actual-cost performance), whereas the
estimate-side budget view is actuals-free: `afc = currentBudget + trend`. These
are genuinely different definitions, so merging them would entangle two AFC
meanings and risk the EVM page. Instead this is a sibling pure helper that
shares the same *inputs* (the bucketed loaders), not the same combine — net
**zero EVM behavior change**, which the plan prioritized.
- **Tests:** [budget-reconciliation.test.ts](../src/lib/budget-reconciliation.test.ts)
  (7) — chain math, bucket union, totals, credits, NaN coercion.

### Phase 2 — Precise CVR cost attribution (line-item aware) ✅ DONE
- `attributeCvrCostByL1(cvr)` in [cvr-bucket.ts](../src/utils/cvr-bucket.ts) →
  `Record<L1, number>`: with a cost buildup, each line attributes to its own
  `cbsCode`'s L1 (line total = `quantity × unitRate`, so the parts reconcile
  with `costImpact`); otherwise the whole `costImpact` lands on `cbsCodes[0]`'s
  L1. Blank/short codes → "" (unattributed), never dropped.
- `loadRevisionsByL1(projectId)` in [reporting.ts](../src/utils/reporting.ts) —
  same APPROVED/EXECUTED query as `loadRevisionsByBucket` but line-item-aware
  and keyed by L1. **Exported and ready; consumed by Phase 3** (not yet called).
- **Tests:** 6 cases in [cvr-bucket.test.ts](../src/utils/cvr-bucket.test.ts) —
  multi-account split + sum-reconciles, fallback, empty-array, unattributed,
  credit lines, zero-amount skip.
- Trend L1 attribution (`loadTrendForecastByL1`) is deferred to Phase 3; trends
  have no line items, so it's `resolveCvrBucket`→L1 from `cbsCodes[0]`.

### Phase 3 — Server: always-on project budget endpoint ✅ DONE
`fetchBudgetReconciliation({ projectId, baselineSnapshotId? })` +
`budgetReconciliationQueryOptions` in [reporting.ts](../src/utils/reporting.ts)
(kept there rather than a new `budget.ts` — all the loaders/snapshot/totals
helpers already live there, so no internals had to be re-exported).
- **As-bid** from the chosen snapshot's cached `totals` (new `bacByL1`), latest
  snapshot when unspecified, live estimate (`loadProjectTotals`, extracted in
  [projectTotals.ts](../src/utils/projectTotals.ts)) when none. Legacy snapshots
  recompute from frozen `fefRows`.
- **approvedByL1** (`loadRevisionsByL1`, Phase 2) + **trendByL1** (new
  `loadTrendForecastByL1`).
- Returns the reconciliation at **L1** and **discipline** levels (discipline is
  the L1 view rolled up via `rollUpL1ToDiscipline`, so a discipline row is
  exactly the sum of its accounts — and more precise than EVM's
  whole-cost-on-first-code attribution) + grand total. The working-estimate
  total is *not* returned — Phase 4 reads it from the existing
  `projectFefRowTotalsQueryOptions` already loaded on Summary.
- **Invalidation:** wired into `invalidateChangeLogQueries` +
  `invalidateTrendQueries` (the continuous movers). Snapshot-mutation
  invalidation is deferred to Phase 4 (the snapshot controls + budget UI land in
  the same component); the 30s `staleTime` covers the gap meanwhile.
- **Tests:** `rollUpL1ToDiscipline` (4) in cvr-bucket.test.ts; the combine +
  attribution are already covered. Verified end-to-end against live data
  (6 approved CVRs → correct per-discipline split, `currentBudget = asBid +
  approvedChange`).
- **Note for Phase 4:** pick an as-bid snapshot taken on a *populated* estimate
  — a snapshot frozen before take-off rows exist shows `asBid = 0`.

### Phase 4 — UI: "Current Budget & Forecast" section on Summary ✅ DONE
- [BudgetSection.tsx](../src/components/BudgetSection.tsx), rendered on
  [summary.tsx](../src/routes/summary.tsx) above Snapshots.
- Baseline-snapshot picker (defaults to latest; shows resolved baseline label,
  or "live estimate (no snapshot)").
- Waterfall per discipline, expandable (chevron) to its CBS L1 accounts:
  `As-bid | + Approved | = Current Budget | + Trend (wtd) | = AFC`, with a
  grand-total footer and a working-estimate-vs-as-bid callout (read from the
  existing `projectFefRowTotalsQueryOptions`). L1 rows grouped under disciplines
  via the shared `disciplineForL1`, so each discipline = sum of its children.
- Snapshot create/delete now invalidate `budgetReconciliationAll` (the deferred
  Phase 3 wiring), so the default-latest baseline refreshes.
- **Not yet done:** the optional "pending changes" column
  (REQUESTED…PENDING_APPROVAL) — left for a follow-up.
- **Caveat:** type-checked + suite green, but **not yet run in a browser** —
  rendering, the expand/collapse, and the picker need a manual pass.

### Phase 5 — Bidirectional visibility (links)
- **CVR dialog:** a small "Budget impact" line — which account(s)/discipline
  this CVR moves and by how much (already have `cbsCodes` + `costImpact`/lines).
- **Summary budget row:** drill-in → the Change Log filtered to that
  discipline/L1 (reuse the existing `?q=`/filter deep-link pattern).
- **Full-CBS reconciliation (stretch):** extend `accumulateProjectTotals` to
  emit `…ByCbsCode`, enabling line-level reconciliation. Bigger; defer.

## Reuse map (what to touch)
| Need | Reuse / extend |
|---|---|
| BAC from estimate | `bacByDiscipline` + new `bacByL1` over snapshot `totals` / live totals |
| Approved CVR cost | `loadRevisionsByBucket` → add `loadRevisionsByL1` + `attributeCvrCost` |
| Weighted trends | `loadTrendForecastByBucket` (as-is) |
| Combine math | extract `computeBudgetReconciliation` from `computePeriodEvm` |
| Estimate totals | `ProjectFefRowTotals.{laborByL1,materialsByL1}`, `projectFefRowTotalsQueryOptions` |
| UI shell | `summary.tsx` section + `SnapshotsSection` patterns |

## Risks / notes
- **Attribution ambiguity** for manual-cost CVRs with multiple `cbsCodes` and no
  line items → falls back to `cbsCodes[0]` (documented, same as EVM today).
- **Snapshot staleness:** reconciliation against a baseline snapshot uses the
  *current* CVR/trend set (same caveat the EVM code already documents) — fine
  for a "where do we stand now" view.
- **Don't double-count CONVERTED trends** — they already live in `revisions`
  via their linked CVR (the existing code handles this; preserve it).
- Keep the reconciliation **pure + unit-tested**; it's the kind of money math
  that must not regress.

## Suggested sequencing
Phase 1 + 2 (pure cores + tests) → Phase 3 (endpoint) → Phase 4 (Summary UI) →
Phase 5 (links). Phases 1–3 are low-risk refactors/additions with no UI change;
the visible payoff lands in Phase 4.

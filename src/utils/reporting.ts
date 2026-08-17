import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  assertProjectAccess,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import { hasAtLeastRole } from "./users";
import { bacByBucket } from "~/lib/bac-buckets";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
  type ProjectTotalsRow,
} from "~/lib/project-totals";
import {
  DIGIT_TO_DISCIPLINE,
  L1_TO_DISCIPLINE,
  disciplinesData,
} from "~/config/disciplines-data";
import type { EvmMetrics } from "~/lib/evm";
import { qk } from "~/lib/query-keys";
import { z } from "zod";
import {
  Id,
  ProjectId,
  parseIdInput,
  parseIdScalar,
  parseProjectIdInput,
} from "~/lib/validators";

const CreateReportingPeriodSchema = z.object({
  projectId: ProjectId,
  label: z.string().trim().min(1),
  dataDate: z.string(),
  baselineSnapshotId: Id,
});

const UpsertMeasurementSchema = z.object({
  periodId: Id,
  bucket: z.string(),
  percentComplete: z.number().finite(),
  actualCost: z.number().finite(),
  actualHours: z.number().finite().nullable().optional(),
  plannedValueOverride: z.number().finite().nullable().optional(),
  notes: z.string().optional(),
});
import {
  computePeriodEvm,
  type PeriodBucketRow as PurePeriodBucketRow,
} from "~/lib/period-evm";
import {
  attributeCvrCostByL1,
  resolveCvrBucket,
  rollUpL1ToDiscipline,
} from "./cvr-bucket";
import {
  computeBudgetReconciliation,
  type BudgetReconciliationRow,
} from "~/lib/budget-reconciliation";
import { CVR_OPEN_STATUSES } from "./changelog";
import {
  trendForecastContribution,
  TREND_ACTIVE_STATUSES,
  type TrendStatus,
} from "./trends";

/**
 * SERVER-SIDE reporting module: reporting periods (EVM cutoffs) and the
 * per-bucket measurements that feed the math. The heavy `fetchPeriodWithEvm`
 * is the one the UI/dashboard call — it joins:
 *   - the period's baseline snapshot (drives BAC by digit bucket)
 *   - the project's APPROVED/EXECUTED CVRs (drive budgetRevisions)
 *   - the project's start/end dates (drive time-linear PV fallback)
 *   - the measurements themselves (drive percentComplete / AC / PV-override)
 * and runs the pure `computeEvm` over each bucket.
 */

export type ReportingPeriodItem = {
  id: number;
  label: string;
  /** ISO timestamp. */
  dataDate: string;
  baselineSnapshotId: number;
  baselineLabel: string;
  measurementCount: number;
  createdByEmail: string | null;
  createdAt: string;
};

// Re-export the pure type so existing consumers (route, dashboard card)
// keep their `~/utils/reporting` import path unchanged.
export type PeriodBucketRow = PurePeriodBucketRow;

/** Discipline id → display label, for naming EVM buckets. */
const disciplineLabelById: Record<string, string> = Object.fromEntries(
  disciplinesData.map((d) => [d.id, d.summaryLabel ?? d.label]),
);

/**
 * BAC per **discipline** — the EVM bucket scheme. Attributes each L1's cost to
 * its owning discipline (`L1_TO_DISCIPLINE`), falling back to the digit's
 * canonical discipline for any L1 not explicitly listed (so no cost is
 * dropped). Using L1 (not the leading digit) is what lets Grout (29X) carry its
 * own EVM bucket instead of folding into Concrete's digit "2".
 */
function bacByDiscipline(totals: ProjectFefRowTotals): Record<string, number> {
  return bacByBucket(
    totals,
    (l1) => L1_TO_DISCIPLINE[l1] ?? DIGIT_TO_DISCIPLINE[l1[0]],
  );
}

/** A cached snapshot total is usable only if it carries the L1 buckets the
 *  discipline aggregation needs; pre-`byL1` caches fall back to a recompute. */
function hasL1Buckets(totals: unknown): totals is ProjectFefRowTotals {
  return (
    totals !== null &&
    typeof totals === "object" &&
    "laborByL1" in (totals as Record<string, unknown>)
  );
}

/**
 * The L1-bucketed totals for a baseline snapshot: its cached `totals` when they
 * carry the L1 buckets, otherwise a recompute from the snapshot's frozen
 * `fefRows` (legacy / pre-`byL1` caches). New snapshots never hit the recompute.
 *
 * For a single snapshot only — `fetchEvmTimeSeries` batches the recompute across
 * many periods in one query instead of calling this per row.
 */
async function resolveBaselineTotals(snapshot: {
  id: number;
  totals: unknown;
}): Promise<ProjectFefRowTotals> {
  if (hasL1Buckets(snapshot.totals)) return snapshot.totals;
  const legacy = await prisma.estimateSnapshot.findUniqueOrThrow({
    where: { id: snapshot.id },
    select: { fefRows: true },
  });
  return accumulateProjectTotals(
    (legacy.fefRows as unknown as ProjectTotalsRow[]) ?? [],
  );
}

export type PeriodWithEvm = {
  id: number;
  projectId: number;
  label: string;
  dataDate: string;
  baselineSnapshotId: number;
  baselineLabel: string;
  /** Pre-resolved for the UI; "" when the project has no start/end set. */
  projectStartDate: string | null;
  projectEndDate: string | null;
  buckets: PeriodBucketRow[];
  total: EvmMetrics;
};

export const fetchReportingPeriods = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<ReportingPeriodItem[]> => {
    await requireProjectAccess(projectId);
    const periods = await prisma.reportingPeriod.findMany({
      where: { projectId },
      orderBy: { dataDate: "desc" },
      include: {
        baselineSnapshot: { select: { label: true } },
        _count: { select: { measurements: true } },
      },
    });
    const userIds = Array.from(
      new Set(
        periods
          .map((p) => p.createdById)
          .filter((id): id is number => id !== null),
      ),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    return periods.map((p) => ({
      id: p.id,
      label: p.label,
      dataDate: p.dataDate.toISOString(),
      baselineSnapshotId: p.baselineSnapshotId,
      baselineLabel: p.baselineSnapshot.label,
      measurementCount: p._count.measurements,
      createdByEmail:
        p.createdById !== null ? (emailById.get(p.createdById) ?? null) : null,
      createdAt: p.createdAt.toISOString(),
    }));
  });

/**
 * Bucketed pending-trend forecast — sums `probability × costLikely` of
 * IDENTIFIED + PROBABLE trends per resolved digit bucket. Drives the AFC /
 * VAFC columns on the reporting page.
 *
 * Lives here (not in `trends.ts`) so prisma access stays out of any module
 * the client bundles — the rest of `trends.ts` keeps every prisma touch
 * inside a `createServerFn` handler, so tree-shaking can drop the import
 * from the client. A module-scope async function using prisma would defeat
 * that and pull the Node-only prisma client into the browser bundle.
 *
 * Caveat (mirrors `loadRevisionsByBucket`): uses the *current* trend set,
 * not the set as of any historical date — so historical period reads show
 * today's pending trends against the period's measurements. Acceptable for
 * the same reason the revisions one is: PV/EV/AC don't depend on trends;
 * only AFC/VAFC are approximate against historical state.
 */
/** The active (IDENTIFIED + PROBABLE) trends for a project, carrying the fields
 *  both forecast bucketings need. One query shared by the two aggregations. */
async function loadActiveTrends(projectId: number) {
  return prisma.trend.findMany({
    where: { projectId, status: { in: TREND_ACTIVE_STATUSES } },
    select: {
      status: true,
      probability: true,
      costLikely: true,
      cbsCodes: true,
      discipline: true,
    },
  });
}

// Explicit (not `Awaited<ReturnType<typeof loadActiveTrends>>`) on purpose: a
// `typeof` on a prisma-using function is a module-scope value reference that
// keeps the prisma import alive in the client transform (see check-client-leak).
type ActiveTrend = {
  status: string;
  probability: number;
  costLikely: number;
  cbsCodes: string[];
  discipline: string;
};

/** Sum each trend's probability-weighted forecast into the bucket `bucketOf`
 *  returns. Returning `null` drops the trend; a "" bucket collects the
 *  unattributed. Shared by the by-bucket and by-L1 forecasts. */
function sumTrendForecast(
  trends: ActiveTrend[],
  bucketOf: (t: ActiveTrend) => string | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of trends) {
    const contrib = trendForecastContribution({
      status: t.status as TrendStatus,
      probability: t.probability,
      costLikely: t.costLikely,
    });
    if (contrib === 0) continue;
    const bucket = bucketOf(t);
    if (bucket === null) continue;
    out[bucket] = (out[bucket] ?? 0) + contrib;
  }
  return out;
}

async function loadTrendForecastByBucket(
  projectId: number,
): Promise<Record<string, number>> {
  return sumTrendForecast(
    await loadActiveTrends(projectId),
    (t) => resolveCvrBucket(t) || null,
  );
}

// Sum of APPROVED/EXECUTED CVR cost impacts grouped by their resolved digit
// bucket. Caveat: uses the *current* approved set, not the set as of any
// historical date — so historical period reads show today's revisions
// against the period's measurements. PV/EV/AC don't depend on this; only
// `currentBudget` and `vac` are approximate against historical state.
async function loadRevisionsByBucket(
  projectId: number,
): Promise<Record<string, number>> {
  const cvrs = await prisma.changeLog.findMany({
    where: { projectId, status: { in: ["APPROVED", "EXECUTED"] } },
    select: { costImpact: true, cbsCodes: true, discipline: true },
  });
  const revisions: Record<string, number> = {};
  for (const c of cvrs) {
    const b = resolveCvrBucket(c);
    if (!b) continue;
    revisions[b] = (revisions[b] ?? 0) + c.costImpact;
  }
  return revisions;
}

/**
 * CVR change attributed to **L1** (3-char parent CBS) buckets, line-item-aware,
 * split into **approved** (APPROVED/EXECUTED — authorized budget) and
 * **pending** (REQUESTED…PENDING_APPROVAL — the approval pipeline). One query
 * for both; each is bucketed by `attributeCvrCostByL1` (cost buildup splits a
 * multi-account CVR across its lines; manual-cost CVRs fall back to
 * `cbsCodes[0]`'s L1; blank/short codes land under "").
 *
 * Module-private (NOT exported) on purpose — see `loadProjectTotals` in
 * projectTotals.ts: an exported module-scope prisma function survives the
 * client transform and leaks the Prisma client into the browser bundle.
 */
async function loadCvrChangeByL1(projectId: number): Promise<{
  approved: Record<string, number>;
  pending: Record<string, number>;
}> {
  const cvrs = await prisma.changeLog.findMany({
    where: {
      projectId,
      status: { in: ["APPROVED", "EXECUTED", ...CVR_OPEN_STATUSES] },
    },
    select: {
      status: true,
      costImpact: true,
      cbsCodes: true,
      lineItems: { select: { cbsCode: true, quantity: true, unitRate: true } },
    },
  });
  const approved: Record<string, number> = {};
  const pending: Record<string, number> = {};
  for (const c of cvrs) {
    const target =
      c.status === "APPROVED" || c.status === "EXECUTED" ? approved : pending;
    for (const [l1, amount] of Object.entries(attributeCvrCostByL1(c))) {
      target[l1] = (target[l1] ?? 0) + amount;
    }
  }
  return { approved, pending };
}

/** As-bid BAC per L1 (3-char parent CBS) = labor + materials. The L1-keyed
 *  sibling of `bacByDiscipline` — every L1 is its own bucket (identity key). */
function bacByL1(totals: ProjectFefRowTotals): Record<string, number> {
  return bacByBucket(totals, (l1) => l1);
}

/** Pending-trend forecast per L1 (trends carry no cost buildup, so the whole
 *  weighted forecast lands on `cbsCodes[0]`'s L1; codeless → "" unattributed). */
async function loadTrendForecastByL1(
  projectId: number,
): Promise<Record<string, number>> {
  return sumTrendForecast(await loadActiveTrends(projectId), (t) => {
    const code = t.cbsCodes[0] ?? "";
    return code.length >= 3 ? code.slice(0, 3) : "";
  });
}

export type BudgetReconciliationDisciplineRow = BudgetReconciliationRow & {
  disciplineLabel: string;
};

/** An L1 reconciliation row enriched with its CBS account name (from
 *  `CbsItem.accountDescription`), or null when the L1 isn't in the catalog. */
export type BudgetReconciliationL1Row = BudgetReconciliationRow & {
  name: string | null;
};

/** Always-on living-budget reconciliation for a project: as-bid → approved
 *  changes → current budget → weighted trends → AFC, at L1 and discipline
 *  granularity. Unlike the period EVM read, it needs no reporting period. */
export type ProjectBudgetReconciliation = {
  /** Snapshot used as the as-bid baseline; null when none exists (live-estimate
   *  fallback). */
  baselineSnapshotId: number | null;
  baselineLabel: string | null;
  byDiscipline: BudgetReconciliationDisciplineRow[];
  byL1: BudgetReconciliationL1Row[];
  total: BudgetReconciliationRow;
};

const BudgetReconciliationInputSchema = z.object({
  projectId: ProjectId,
  baselineSnapshotId: Id.nullable().optional(),
});

export const fetchBudgetReconciliation = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    BudgetReconciliationInputSchema.parse(input),
  )
  .handler(async ({ data }): Promise<ProjectBudgetReconciliation> => {
    await requireProjectAccess(data.projectId);

    // The baseline-snapshot lookup and the project-wide approved-CVR / trend
    // loads are independent — run all three in parallel rather than serially.
    // (Resolving the as-bid totals from `snap` may add one more await on the
    // rare legacy/no-snapshot paths below.)
    const [snap, cvrChange, trendByL1] = await Promise.all([
      data.baselineSnapshotId
        ? prisma.estimateSnapshot.findUnique({
            where: { id: data.baselineSnapshotId },
            select: { id: true, projectId: true, label: true, totals: true },
          })
        : prisma.estimateSnapshot.findFirst({
            where: { projectId: data.projectId },
            orderBy: { createdAt: "desc" },
            select: { id: true, projectId: true, label: true, totals: true },
          }),
      loadCvrChangeByL1(data.projectId),
      loadTrendForecastByL1(data.projectId),
    ]);
    const { approved: approvedByL1, pending: pendingByL1 } = cvrChange;

    let baselineSnapshotId: number | null = null;
    let baselineLabel: string | null = null;
    let asBidTotals: ProjectFefRowTotals;
    if (snap && snap.projectId === data.projectId) {
      baselineSnapshotId = snap.id;
      baselineLabel = snap.label;
      asBidTotals = await resolveBaselineTotals(snap);
    } else {
      // No snapshot — reconcile against the live estimate. Inlined here (rather
      // than importing a shared loader from projectTotals.ts) to keep this
      // prisma call inside the handler, so the client transform strips it and
      // the Prisma client never reaches the browser bundle. "Live" is the
      // project's latest estimate version.
      const latestVersion = await prisma.estimateVersion.findFirst({
        where: { projectId: data.projectId },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      const rows = latestVersion
        ? await prisma.fefRow.findMany({
            where: { versionId: latestVersion.id },
            select: {
              discipline: true,
              section: true,
              cbsCode: true,
              area: true,
              quantity: true,
              laborHours: true,
              laborRate: true,
              materialCost: true,
            },
          })
        : [];
      asBidTotals = accumulateProjectTotals(rows);
    }

    const asBidByL1 = bacByL1(asBidTotals);

    const l1 = computeBudgetReconciliation({
      asBidByBucket: asBidByL1,
      approvedByBucket: approvedByL1,
      pendingByBucket: pendingByL1,
      trendByBucket: trendByL1,
    });
    // Discipline view is the L1 view rolled up — so a discipline's row is
    // exactly the sum of its accounts (internally consistent), and more precise
    // than EVM's whole-cost-on-first-code attribution.
    const disc = computeBudgetReconciliation({
      asBidByBucket: rollUpL1ToDiscipline(asBidByL1),
      approvedByBucket: rollUpL1ToDiscipline(approvedByL1),
      pendingByBucket: rollUpL1ToDiscipline(pendingByL1),
      trendByBucket: rollUpL1ToDiscipline(trendByL1),
    });

    // Enrich each L1 row with its CBS account name so the UI can show
    // "611 — High Alloy SS…" instead of a bare code. One row per L1
    // (`distinct`); L1s not in the catalog (e.g. ad-hoc CVR codes) get null.
    const l1Codes = l1.byBucket
      .map((r) => r.bucket)
      .filter((b): b is string => b !== "");
    const nameRows = l1Codes.length
      ? await prisma.cbsItem.findMany({
          where: { l1: { in: l1Codes } },
          select: { l1: true, accountDescription: true, name: true },
          distinct: ["l1"],
          orderBy: { id: "asc" },
        })
      : [];
    // Prefer the account description; fall back to the item name for the rare
    // L1 whose accountDescription is blank. null only when the L1 isn't in the
    // catalog at all (e.g. an ad-hoc CVR code) — the UI flags that case.
    const nameByL1 = new Map(
      nameRows.map((r) => [r.l1, r.accountDescription || r.name || null]),
    );

    return {
      baselineSnapshotId,
      baselineLabel,
      byL1: l1.byBucket.map((r) => ({
        ...r,
        name: r.bucket ? (nameByL1.get(r.bucket) ?? null) : null,
      })),
      byDiscipline: disc.byBucket.map((r) => ({
        ...r,
        disciplineLabel:
          r.bucket === ""
            ? "Unattributed"
            : (disciplineLabelById[r.bucket] ?? r.bucket),
      })),
      total: l1.total,
    };
  });

export const budgetReconciliationQueryOptions = (
  projectId: number | null,
  baselineSnapshotId: number | null = null,
) =>
  queryOptions({
    queryKey: qk.reporting.budgetReconciliation(projectId, baselineSnapshotId),
    queryFn: (): Promise<ProjectBudgetReconciliation | null> =>
      projectId === null
        ? Promise.resolve(null)
        : fetchBudgetReconciliation({
            data: { projectId, baselineSnapshotId },
          }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

export const createReportingPeriod = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateReportingPeriodSchema.parse(input))
  .handler(async ({ data }): Promise<ReportingPeriodItem> => {
    const actor = await requireProjectAccess(data.projectId);
    const label = data.label.trim();
    if (!label) throw new Error("Period label is required.");
    // Confirm the snapshot belongs to this project — prevents cross-project
    // baseline-pointing by tampered input.
    const snap = await prisma.estimateSnapshot.findUniqueOrThrow({
      where: { id: data.baselineSnapshotId },
      select: { projectId: true, label: true },
    });
    if (snap.projectId !== data.projectId) {
      throw new Error("Baseline snapshot does not belong to this project.");
    }
    const created = await prisma.reportingPeriod.create({
      data: {
        projectId: data.projectId,
        label,
        dataDate: new Date(data.dataDate),
        baselineSnapshotId: data.baselineSnapshotId,
        createdById: actor.id,
      },
    });
    return {
      id: created.id,
      label: created.label,
      dataDate: created.dataDate.toISOString(),
      baselineSnapshotId: created.baselineSnapshotId,
      baselineLabel: snap.label,
      measurementCount: 0,
      createdByEmail: actor.email,
      createdAt: created.createdAt.toISOString(),
    };
  });

export const upsertMeasurement = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpsertMeasurementSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    const period = await prisma.reportingPeriod.findUniqueOrThrow({
      where: { id: data.periodId },
      select: { projectId: true },
    });
    await assertProjectAccess(actor, period.projectId);
    await prisma.periodMeasurement.upsert({
      where: {
        periodId_bucket: { periodId: data.periodId, bucket: data.bucket },
      },
      create: {
        periodId: data.periodId,
        bucket: data.bucket,
        percentComplete: data.percentComplete,
        actualCost: data.actualCost,
        actualHours: data.actualHours ?? null,
        plannedValueOverride: data.plannedValueOverride ?? null,
        notes: data.notes?.trim() ?? "",
      },
      update: {
        percentComplete: data.percentComplete,
        actualCost: data.actualCost,
        actualHours: data.actualHours ?? null,
        plannedValueOverride: data.plannedValueOverride ?? null,
        notes: data.notes?.trim() ?? "",
      },
    });
    return { ok: true };
  });

export const deleteReportingPeriod = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    const period = await prisma.reportingPeriod.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true, createdById: true },
    });
    await assertProjectAccess(actor, period.projectId);
    const isAdmin = hasAtLeastRole(actor.role, "ADMINISTRATOR");
    const isCreator =
      period.createdById !== null && period.createdById === actor.id;
    if (!isAdmin && !isCreator) {
      throw new Error(
        "Only the period creator or an administrator can delete this period.",
      );
    }
    // Cascade-deletes measurements via the FK.
    await prisma.reportingPeriod.delete({ where: { id: data.id } });
    return { ok: true };
  });

/**
 * The big one: load the period, its baseline snapshot's totals, the project's
 * approved CVR cost impacts, and the measurements; compute EVM per bucket
 * and an aggregated total. Buckets shown are the union of:
 *   - buckets with BAC > 0 in the snapshot
 *   - buckets with budgetRevisions > 0 from CVRs
 *   - buckets with a saved measurement
 * so a CVR or measurement referencing a discipline not in the snapshot still
 * surfaces in the table rather than being silently dropped.
 */
export const fetchPeriodWithEvm = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data: id }): Promise<PeriodWithEvm> => {
    const period = await prisma.reportingPeriod.findUniqueOrThrow({
      where: { id },
      include: {
        // Pull the cached `totals` instead of the heavy `fefRows` blob —
        // snapshots are immutable so the cached value is always correct.
        // `fefRows` is fetched only on the legacy-snapshot fallback below.
        baselineSnapshot: {
          select: { id: true, label: true, totals: true },
        },
        measurements: true,
        project: { select: { startDate: true, endDate: true } },
      },
    });
    await requireProjectAccess(period.projectId);

    // 1. BAC by bucket — the cached aggregator output, or a recompute from the
    // frozen rows for legacy snapshots (created before the `totals` column).
    // New snapshots never hit the recompute.
    const baselineTotals = await resolveBaselineTotals(period.baselineSnapshot);

    // 2/3. CVR-driven budget revisions + probability-weighted pending-trend
    //    forecast, per bucket. Independent reads — run them in parallel.
    //    APPROVED/EXECUTED CVRs only; IDENTIFIED + PROBABLE trends only
    //    (CONVERTED trends already live in `revisionsByBucket` via their CVR).
    const [revisionsByBucket, trendForecastByBucket] = await Promise.all([
      loadRevisionsByBucket(period.projectId),
      loadTrendForecastByBucket(period.projectId),
    ]);

    // 4. Hand the loaded data to the pure helper for the per-bucket math.
    const dataDateIso = period.dataDate.toISOString();
    const { buckets: rows, total } = computePeriodEvm({
      bacByBucket: bacByDiscipline(baselineTotals),
      revisionsByBucket,
      trendForecastByBucket,
      measurements: period.measurements,
      projectStartDate: period.project.startDate,
      projectEndDate: period.project.endDate,
      dataDate: dataDateIso,
    });
    // Name each discipline bucket for the UI (the pure layer leaves it blank).
    const buckets = rows.map((r) => ({
      ...r,
      disciplineLabel: disciplineLabelById[r.bucket] ?? "",
    }));

    return {
      id: period.id,
      projectId: period.projectId,
      label: period.label,
      dataDate: dataDateIso,
      baselineSnapshotId: period.baselineSnapshot.id,
      baselineLabel: period.baselineSnapshot.label,
      projectStartDate: period.project.startDate
        ? period.project.startDate.toISOString()
        : null,
      projectEndDate: period.project.endDate
        ? period.project.endDate.toISOString()
        : null,
      buckets,
      total,
    };
  });

export const reportingPeriodsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.reporting.periods(projectId),
    queryFn: (): Promise<ReportingPeriodItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchReportingPeriods({ data: projectId }),
    enabled: projectId !== null,
  });

export const periodWithEvmQueryOptions = (periodId: number | null) =>
  queryOptions({
    queryKey: qk.reporting.periodWithEvm(periodId),
    queryFn: (): Promise<PeriodWithEvm | null> =>
      periodId === null
        ? Promise.resolve(null)
        : fetchPeriodWithEvm({ data: periodId }),
    enabled: periodId !== null,
  });

/** Latest period for the project — used by the dashboard EVM card. */
export const fetchLatestPeriodWithEvm = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<PeriodWithEvm | null> => {
    await requireProjectAccess(projectId);
    const latest = await prisma.reportingPeriod.findFirst({
      where: { projectId },
      orderBy: { dataDate: "desc" },
      select: { id: true },
    });
    if (!latest) return null;
    return fetchPeriodWithEvm({ data: latest.id });
  });

export const latestPeriodWithEvmQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.reporting.latestPeriodWithEvm(projectId),
    queryFn: (): Promise<PeriodWithEvm | null> =>
      projectId === null
        ? Promise.resolve(null)
        : fetchLatestPeriodWithEvm({ data: projectId }),
    enabled: projectId !== null,
  });

/** Time-series point for the EVM S-curve. Project total per period; the
 *  S-curve plots `pv`, `ev`, and `ac` across dataDates. */
export type EvmTimeSeriesPoint = {
  periodId: number;
  label: string;
  /** ISO timestamp. Sorted ascending in the response. */
  dataDate: string;
  total: EvmMetrics;
};

/**
 * Project-total EVM at every reporting period, sorted by data date. Drives
 * the S-curve chart (PV/EV/AC vs. time) on the Reporting page.
 *
 * One DB round-trip for all periods + measurements + their cached snapshot
 * totals, one for CVRs, one for project dates — N periods, three queries.
 * Falls back to recomputing per snapshot if any are pre-cache (legacy).
 *
 * Caveat: CVR revisions use the *current* approved set for every period,
 * not the set authorized at that period's data date. PV/EV/AC are unaffected
 * (they don't depend on revisions); only `currentBudget` and `vac` are
 * approximate against historical state. Acceptable for v1 of the chart —
 * historical CVR-at-date precision needs audit-log lookups and is a follow-up.
 */
export const fetchEvmTimeSeries = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<EvmTimeSeriesPoint[]> => {
    await requireProjectAccess(projectId);
    const periods = await prisma.reportingPeriod.findMany({
      where: { projectId },
      orderBy: { dataDate: "asc" },
      include: {
        baselineSnapshot: { select: { id: true, totals: true } },
        measurements: true,
      },
    });
    if (periods.length === 0) return [];

    // Project dates + the project-wide CVR/trend buckets are independent of
    // each other — fetch them in parallel rather than three serial round-trips.
    const [project, revisionsByBucket, trendForecastByBucket] =
      await Promise.all([
        prisma.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { startDate: true, endDate: true },
        }),
        loadRevisionsByBucket(projectId),
        loadTrendForecastByBucket(projectId),
      ]);

    // Resolve any legacy snapshots (no cached `totals`) up front — one extra
    // query each. Almost always empty; only matters for snapshots created
    // before the cache column existed.
    const missingTotalsIds = Array.from(
      new Set(
        periods
          .filter((p) => !hasL1Buckets(p.baselineSnapshot.totals))
          .map((p) => p.baselineSnapshot.id),
      ),
    );
    const legacyTotalsById = new Map<number, ProjectFefRowTotals>();
    if (missingTotalsIds.length > 0) {
      const legacy = await prisma.estimateSnapshot.findMany({
        where: { id: { in: missingTotalsIds } },
        select: { id: true, fefRows: true },
      });
      for (const s of legacy) {
        const rows = (s.fefRows as unknown as ProjectTotalsRow[]) ?? [];
        legacyTotalsById.set(s.id, accumulateProjectTotals(rows));
      }
    }

    return periods.map((p) => {
      const baselineTotals: ProjectFefRowTotals = hasL1Buckets(
        p.baselineSnapshot.totals,
      )
        ? p.baselineSnapshot.totals
        : (legacyTotalsById.get(p.baselineSnapshot.id) ?? EMPTY_TOTALS);
      const { total } = computePeriodEvm({
        bacByBucket: bacByDiscipline(baselineTotals),
        revisionsByBucket,
        trendForecastByBucket,
        measurements: p.measurements,
        projectStartDate: project.startDate,
        projectEndDate: project.endDate,
        dataDate: p.dataDate.toISOString(),
      });
      return {
        periodId: p.id,
        label: p.label,
        dataDate: p.dataDate.toISOString(),
        total,
      };
    });
  });

// Local empty-totals constant for the legacy-snapshot fallback in
// `fetchEvmTimeSeries`. Same shape `EMPTY_TOTALS` in projectTotals.ts uses,
// duplicated here to avoid cross-module import (projectTotals.ts is its own
// server module and the file boundary keeps the dependency one-way).
const EMPTY_TOTALS: ProjectFefRowTotals = {
  laborByDigit: {},
  laborHoursByDigit: {},
  quantityByDigit: {},
  craftSupportLabor: 0,
  craftSupportLaborHours: 0,
  materialsByDigit: {},
  laborByL1: {},
  laborHoursByL1: {},
  quantityByL1: {},
  materialsByL1: {},
  laborByL1L2: {},
  laborHoursByL1L2: {},
  quantityByL1L2: {},
  materialsByL1L2: {},
  byArea: [],
  invalidByDiscipline: {},
};

export const evmTimeSeriesQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.reporting.evmTimeSeries(projectId),
    queryFn: (): Promise<EvmTimeSeriesPoint[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchEvmTimeSeries({ data: projectId }),
    enabled: projectId !== null,
  });

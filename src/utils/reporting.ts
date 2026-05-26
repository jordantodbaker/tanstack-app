import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  assertProjectAccess,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import { hasAtLeastRole } from "./users";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
  type ProjectTotalsRow,
} from "~/lib/project-totals";
import { aggregateEvm, computeEvm, timeLinearPv, type EvmMetrics } from "~/lib/evm";
import { resolveCvrBucket } from "./cvr-bucket";

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

export type PeriodBucketRow = {
  bucket: string;
  /** Discipline label for the bucket digit; "" when the digit has none assigned. */
  disciplineLabel: string;
  percentComplete: number;
  actualCost: number;
  actualHours: number | null;
  /** The PV used to compute SPI: override if set, else time-linear fallback. */
  pvSource: "override" | "time-linear" | "none";
  notes: string;
  metrics: EvmMetrics;
};

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
  .inputValidator((projectId: number) => projectId)
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

export const createReportingPeriod = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: number;
      label: string;
      /** ISO date string. */
      dataDate: string;
      baselineSnapshotId: number;
    }) => input,
  )
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
  .inputValidator(
    (input: {
      periodId: number;
      bucket: string;
      percentComplete: number;
      actualCost: number;
      actualHours?: number | null;
      plannedValueOverride?: number | null;
      notes?: string;
    }) => input,
  )
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
  .inputValidator((input: { id: number }) => input)
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
  .inputValidator((id: number) => id)
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

    // 1. BAC by bucket — read the cached aggregator output. Legacy snapshots
    // (created before the `totals` column existed) fall through to the
    // recompute path. New snapshots never hit it.
    let baselineTotals: ProjectFefRowTotals;
    if (period.baselineSnapshot.totals !== null) {
      baselineTotals =
        period.baselineSnapshot.totals as unknown as ProjectFefRowTotals;
    } else {
      const legacy = await prisma.estimateSnapshot.findUniqueOrThrow({
        where: { id: period.baselineSnapshot.id },
        select: { fefRows: true },
      });
      const rows = (legacy.fefRows as unknown as ProjectTotalsRow[]) ?? [];
      baselineTotals = accumulateProjectTotals(rows);
    }

    // 2. CVR-driven budget revisions per bucket. Only APPROVED / EXECUTED
    //    count — pending/rejected/voided CVRs aren't authorized budget.
    const cvrs = await prisma.changeLog.findMany({
      where: {
        projectId: period.projectId,
        status: { in: ["APPROVED", "EXECUTED"] },
      },
      select: { costImpact: true, cbsCodes: true, discipline: true },
    });
    const revisionsByBucket: Record<string, number> = {};
    for (const c of cvrs) {
      const b = resolveCvrBucket(c);
      if (!b) continue;
      revisionsByBucket[b] = (revisionsByBucket[b] ?? 0) + c.costImpact;
    }

    // 3. Measurement lookup.
    const measByBucket = new Map(period.measurements.map((m) => [m.bucket, m]));

    // 4. Union of buckets from all sources.
    const bucketSet = new Set<string>([
      ...Object.keys(baselineTotals.laborByDigit),
      ...Object.keys(baselineTotals.materialsByDigit),
      ...Object.keys(revisionsByBucket),
      ...measByBucket.keys(),
    ]);
    const buckets = Array.from(bucketSet).sort();

    const dataDateIso = period.dataDate.toISOString();
    const rows: PeriodBucketRow[] = buckets.map((bucket) => {
      const bac =
        (baselineTotals.laborByDigit[bucket] ?? 0) +
        (baselineTotals.materialsByDigit[bucket] ?? 0);
      const budgetRevisions = revisionsByBucket[bucket] ?? 0;
      const meas = measByBucket.get(bucket);
      const percentComplete = meas?.percentComplete ?? 0;
      const actualCost = meas?.actualCost ?? 0;
      const actualHours = meas?.actualHours ?? null;
      // PV: explicit override wins; else time-linear from project dates;
      // else null source (PV = 0, SPI null in the table).
      let pv = 0;
      let pvSource: PeriodBucketRow["pvSource"] = "none";
      if (meas?.plannedValueOverride != null) {
        pv = meas.plannedValueOverride;
        pvSource = "override";
      } else if (period.project.startDate && period.project.endDate) {
        pv = timeLinearPv(
          bac,
          period.project.startDate,
          period.project.endDate,
          dataDateIso,
        );
        pvSource = pv > 0 ? "time-linear" : "none";
      }
      const metrics = computeEvm({
        bac,
        budgetRevisions,
        percentComplete,
        actualCost,
        pv,
      });
      return {
        bucket,
        disciplineLabel: "",
        percentComplete,
        actualCost,
        actualHours,
        pvSource,
        notes: meas?.notes ?? "",
        metrics,
      };
    });

    const total = aggregateEvm(rows.map((r) => r.metrics));

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
      buckets: rows,
      total,
    };
  });

export const reportingPeriodsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["reportingPeriods", projectId],
    queryFn: (): Promise<ReportingPeriodItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchReportingPeriods({ data: projectId }),
    enabled: projectId !== null,
  });

export const periodWithEvmQueryOptions = (periodId: number | null) =>
  queryOptions({
    queryKey: ["periodWithEvm", periodId],
    queryFn: (): Promise<PeriodWithEvm | null> =>
      periodId === null
        ? Promise.resolve(null)
        : fetchPeriodWithEvm({ data: periodId }),
    enabled: periodId !== null,
  });

/** Latest period for the project — used by the dashboard EVM card. */
export const fetchLatestPeriodWithEvm = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
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
    queryKey: ["latestPeriodWithEvm", projectId],
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
  .inputValidator((projectId: number) => projectId)
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

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { startDate: true, endDate: true },
    });

    const cvrs = await prisma.changeLog.findMany({
      where: {
        projectId,
        status: { in: ["APPROVED", "EXECUTED"] },
      },
      select: { costImpact: true, cbsCodes: true, discipline: true },
    });
    const revisionsByBucket: Record<string, number> = {};
    for (const c of cvrs) {
      const b = resolveCvrBucket(c);
      if (!b) continue;
      revisionsByBucket[b] = (revisionsByBucket[b] ?? 0) + c.costImpact;
    }

    // Resolve any legacy snapshots (no cached `totals`) up front — one extra
    // query each. Almost always empty; only matters for snapshots created
    // before the cache column existed.
    const missingTotalsIds = Array.from(
      new Set(
        periods
          .filter((p) => p.baselineSnapshot.totals === null)
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
      const baselineTotals: ProjectFefRowTotals =
        p.baselineSnapshot.totals !== null
          ? (p.baselineSnapshot.totals as unknown as ProjectFefRowTotals)
          : (legacyTotalsById.get(p.baselineSnapshot.id) ?? {
              laborByDigit: {},
              laborHoursByDigit: {},
              quantityByDigit: {},
              craftSupportLabor: 0,
              craftSupportLaborHours: 0,
              materialsByDigit: {},
              byArea: [],
              invalidByDiscipline: {},
            });
      const measByBucket = new Map(
        p.measurements.map((m) => [m.bucket, m]),
      );
      const buckets = Array.from(
        new Set<string>([
          ...Object.keys(baselineTotals.laborByDigit),
          ...Object.keys(baselineTotals.materialsByDigit),
          ...Object.keys(revisionsByBucket),
          ...measByBucket.keys(),
        ]),
      );
      const dataDateIso = p.dataDate.toISOString();
      const perBucket: EvmMetrics[] = buckets.map((bucket) => {
        const bac =
          (baselineTotals.laborByDigit[bucket] ?? 0) +
          (baselineTotals.materialsByDigit[bucket] ?? 0);
        const meas = measByBucket.get(bucket);
        let pv = 0;
        if (meas?.plannedValueOverride != null) {
          pv = meas.plannedValueOverride;
        } else if (project.startDate && project.endDate) {
          pv = timeLinearPv(bac, project.startDate, project.endDate, dataDateIso);
        }
        return computeEvm({
          bac,
          budgetRevisions: revisionsByBucket[bucket] ?? 0,
          percentComplete: meas?.percentComplete ?? 0,
          actualCost: meas?.actualCost ?? 0,
          pv,
        });
      });
      return {
        periodId: p.id,
        label: p.label,
        dataDate: dataDateIso,
        total: aggregateEvm(perBucket),
      };
    });
  });

export const evmTimeSeriesQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["evmTimeSeries", projectId],
    queryFn: (): Promise<EvmTimeSeriesPoint[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchEvmTimeSeries({ data: projectId }),
    enabled: projectId !== null,
  });

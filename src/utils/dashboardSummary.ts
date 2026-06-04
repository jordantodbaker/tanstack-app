import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";
import { qk } from "../lib/query-keys";
import { parseProjectIdInput } from "../lib/validators";
import {
  CHANGE_STATUSES,
  CVR_OPEN_STATUSES,
  RISK_LEVELS,
  type ChangeStatus,
  type RiskLevel,
} from "./changelog";
import {
  FCO_STATUSES,
  FCO_OPEN_STATUSES,
  type FcoStatus,
} from "./fcoLog";
import {
  RFI_STATUSES,
  RFI_OPEN_STATUSES,
  type RfiStatus,
} from "./rfis";
import type {
  AttentionSummary,
  CvrSummary,
  FcoSummary,
  RfiSummary,
} from "./dashboard";

/**
 * Server-side dashboard summary. Replaces the prior pattern of loading every
 * CVR, FCO, and RFI just to reduce them to ~30 numbers — Prisma `aggregate`
 * + `groupBy` does the math on the database side and returns a payload of a
 * few KB instead of a few hundred KB (or MB on busy projects).
 *
 * The return shape matches the client-side `CvrSummary` / `FcoSummary` /
 * `RfiSummary` / `AttentionSummary` types so the dashboard component
 * consumes it identically to the old `summarize*` outputs.
 */

export type DashboardSummary = {
  cvr: CvrSummary;
  fco: FcoSummary;
  rfi: RfiSummary;
  attention: AttentionSummary;
};

export const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  cvr: {
    total: 0,
    open: 0,
    netCost: 0,
    approvedCost: 0,
    scheduleDays: 0,
    laborHours: 0,
    byStatus: [],
    byRisk: [],
    byDiscipline: [],
  },
  fco: {
    total: 0,
    open: 0,
    estCost: 0,
    workStopped: 0,
    byStatus: [],
  },
  rfi: {
    total: 0,
    open: 0,
    awaitingClose: 0,
    pastDue: 0,
    suspectsImpact: 0,
    byStatus: [],
  },
  attention: {
    pendingApproval: 0,
    overdueCvr: 0,
    overdueFco: 0,
    workStopped: 0,
    rfiAwaitingClose: 0,
    rfiPastDue: 0,
  },
};

export const fetchDashboardSummary = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<DashboardSummary> => {
    await requireProjectAccess(projectId);

    // "Past due" boundary: anything dated before the start of today (local
    // server time). Matches the client-side `isPast` predicate in
    // `dashboard.ts`.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Fan every aggregation out in parallel. None of these read more than
    // a handful of rows back from Postgres regardless of project size.
    const [
      cvrAgg,
      cvrOpen,
      cvrApprovedSum,
      cvrPendingApproval,
      cvrOverdue,
      cvrByStatus,
      cvrByRisk,
      cvrByDiscipline,
      fcoAgg,
      fcoOpen,
      fcoWorkStoppedOpen,
      fcoOverdue,
      fcoByStatus,
      rfiTotal,
      rfiOpen,
      rfiAnswered,
      rfiPastDue,
      rfiSuspectsImpact,
      rfiByStatus,
    ] = await Promise.all([
      prisma.changeLog.aggregate({
        where: { projectId },
        _count: { _all: true },
        _sum: {
          costImpact: true,
          scheduleDaysImpact: true,
          laborHoursImpact: true,
        },
      }),
      prisma.changeLog.count({
        where: { projectId, status: { in: CVR_OPEN_STATUSES } },
      }),
      prisma.changeLog.aggregate({
        where: { projectId, status: { in: ["APPROVED", "EXECUTED"] } },
        _sum: { costImpact: true },
      }),
      prisma.changeLog.count({
        where: { projectId, status: "PENDING_APPROVAL" },
      }),
      prisma.changeLog.count({
        where: {
          projectId,
          status: { in: CVR_OPEN_STATUSES },
          dueDate: { lt: startOfToday },
        },
      }),
      prisma.changeLog.groupBy({
        by: ["status"],
        where: { projectId },
        _count: { _all: true },
        _sum: { costImpact: true },
      }),
      prisma.changeLog.groupBy({
        by: ["riskLevel"],
        where: { projectId },
        _count: { _all: true },
      }),
      prisma.changeLog.groupBy({
        by: ["discipline"],
        where: { projectId },
        _sum: { costImpact: true },
      }),
      prisma.fieldChangeOrder.aggregate({
        where: { projectId },
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
      prisma.fieldChangeOrder.count({
        where: { projectId, status: { in: FCO_OPEN_STATUSES } },
      }),
      prisma.fieldChangeOrder.count({
        where: {
          projectId,
          workStopped: true,
          status: { in: FCO_OPEN_STATUSES },
        },
      }),
      prisma.fieldChangeOrder.count({
        where: {
          projectId,
          status: { in: FCO_OPEN_STATUSES },
          neededBy: { lt: startOfToday },
        },
      }),
      prisma.fieldChangeOrder.groupBy({
        by: ["status"],
        where: { projectId },
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
      prisma.rfi.count({ where: { projectId } }),
      prisma.rfi.count({
        where: { projectId, status: { in: RFI_OPEN_STATUSES } },
      }),
      prisma.rfi.count({ where: { projectId, status: "ANSWERED" } }),
      prisma.rfi.count({
        where: {
          projectId,
          status: { in: RFI_OPEN_STATUSES },
          dueDate: { lt: startOfToday },
        },
      }),
      prisma.rfi.count({
        where: {
          projectId,
          status: { in: RFI_OPEN_STATUSES },
          OR: [{ suspectsCostImpact: true }, { suspectsScheduleImpact: true }],
        },
      }),
      prisma.rfi.groupBy({
        by: ["status"],
        where: { projectId },
        _count: { _all: true },
      }),
    ]);

    // Project the unordered Prisma `groupBy` results into the lifecycle-
    // ordered shapes the dashboard expects. Statuses with zero rows are
    // filtered out by the trailing `.filter(...count > 0)` so dashboards
    // for new projects don't show empty rows for every possible status.
    const cvrStatusMap = new Map(
      cvrByStatus.map((r) => [
        r.status as ChangeStatus,
        { count: r._count._all, cost: r._sum.costImpact ?? 0 },
      ]),
    );
    const cvrRiskMap = new Map(
      cvrByRisk.map((r) => [r.riskLevel as RiskLevel, r._count._all]),
    );
    const fcoStatusMap = new Map(
      fcoByStatus.map((r) => [
        r.status as FcoStatus,
        { count: r._count._all, cost: r._sum.estimatedCost ?? 0 },
      ]),
    );
    const rfiStatusMap = new Map(
      rfiByStatus.map((r) => [r.status as RfiStatus, r._count._all]),
    );

    return {
      cvr: {
        total: cvrAgg._count._all,
        open: cvrOpen,
        netCost: cvrAgg._sum.costImpact ?? 0,
        approvedCost: cvrApprovedSum._sum.costImpact ?? 0,
        scheduleDays: cvrAgg._sum.scheduleDaysImpact ?? 0,
        laborHours: cvrAgg._sum.laborHoursImpact ?? 0,
        byStatus: CHANGE_STATUSES.map((status) => ({
          status,
          count: cvrStatusMap.get(status)?.count ?? 0,
          cost: cvrStatusMap.get(status)?.cost ?? 0,
        })).filter((b) => b.count > 0),
        byRisk: RISK_LEVELS.map((level) => ({
          level,
          count: cvrRiskMap.get(level) ?? 0,
        })).filter((b) => b.count > 0),
        byDiscipline: cvrByDiscipline
          .map((d) => ({
            discipline: d.discipline,
            cost: d._sum.costImpact ?? 0,
          }))
          .sort((a, b) => Math.abs(b.cost) - Math.abs(a.cost)),
      },
      fco: {
        total: fcoAgg._count._all,
        open: fcoOpen,
        estCost: fcoAgg._sum.estimatedCost ?? 0,
        workStopped: fcoWorkStoppedOpen,
        byStatus: FCO_STATUSES.map((status) => ({
          status,
          count: fcoStatusMap.get(status)?.count ?? 0,
          cost: fcoStatusMap.get(status)?.cost ?? 0,
        })).filter((b) => b.count > 0),
      },
      rfi: {
        total: rfiTotal,
        open: rfiOpen,
        awaitingClose: rfiAnswered,
        pastDue: rfiPastDue,
        suspectsImpact: rfiSuspectsImpact,
        byStatus: RFI_STATUSES.map((status) => ({
          status,
          count: rfiStatusMap.get(status) ?? 0,
        })).filter((b) => b.count > 0),
      },
      attention: {
        pendingApproval: cvrPendingApproval,
        overdueCvr: cvrOverdue,
        overdueFco: fcoOverdue,
        workStopped: fcoWorkStoppedOpen,
        rfiAwaitingClose: rfiAnswered,
        rfiPastDue,
      },
    };
  });

export const dashboardSummaryQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.dashboardSummary(projectId),
    queryFn: (): Promise<DashboardSummary> =>
      projectId === null
        ? Promise.resolve(EMPTY_DASHBOARD_SUMMARY)
        : fetchDashboardSummary({ data: projectId }),
    enabled: projectId !== null,
    // List-page mutations on CVR / FCO / RFI invalidate ["dashboardSummary"]
    // via the mutation onSuccess hooks, so a refetch timer would just
    // double up that signal. Same approach as `projectFefRowTotals`.
    staleTime: 30 * 1000,
  });

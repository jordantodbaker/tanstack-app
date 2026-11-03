import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { projectIdScopedHandler } from "./users.server";
import { qk } from "../lib/query-keys";
import { parseProjectIdInput } from "../lib/validators";
import {
  CHANGE_STATUSES,
  CVR_OPEN_STATUSES,
  RISK_LEVELS,
  type ChangeStatus,
  type RiskLevel,
} from "./changelog";
import { FCO_STATUSES, FCO_OPEN_STATUSES, type FcoStatus } from "./fcoLog";
import { RFI_STATUSES, RFI_OPEN_STATUSES, type RfiStatus } from "./rfis";
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
  .handler(
    projectIdScopedHandler(
      async ({ data: projectId }): Promise<DashboardSummary> => {
        // "Past due" boundary: anything dated before the start of today (local
        // server time). Matches the client-side `isPast` predicate in
        // `dashboard.ts`.
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // One per-status groupBy per table carries the counts and sums every
        // headline figure needs — the total, the open count, the approved cost,
        // the pending count all fall out of it — so only the filters a status
        // cannot express (a due date, a flag) are their own statement. This was
        // nineteen statements fanned out at once, which on a pool of ten went
        // out in two waves and opened every connection on a cold instance.
        const [
          cvrOverdue,
          cvrByStatus,
          cvrByRisk,
          cvrByDiscipline,
          fcoWorkStoppedOpen,
          fcoOverdue,
          fcoByStatus,
          rfiPastDue,
          rfiSuspectsImpact,
          rfiByStatus,
        ] = await Promise.all([
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
            _sum: {
              costImpact: true,
              scheduleDaysImpact: true,
              laborHoursImpact: true,
            },
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
              OR: [
                { suspectsCostImpact: true },
                { suspectsScheduleImpact: true },
              ],
            },
          }),
          prisma.rfi.groupBy({
            by: ["status"],
            where: { projectId },
            _count: { _all: true },
          }),
        ]);

        // The headline figures, summed from the per-status rows. A missing sum
        // (no rows, or a sum Prisma left null) counts as zero.
        const sumOver = <R extends { status: string }>(
          rows: readonly R[],
          statuses: readonly R["status"][] | null,
          pick: (row: R) => number | null | undefined,
        ): number =>
          rows
            .filter((r) => statuses === null || statuses.includes(r.status))
            .reduce((acc, r) => acc + (pick(r) ?? 0), 0);
        const cvrRows = cvrByStatus.map((r) => ({
          status: r.status as ChangeStatus,
          count: r._count._all,
          cost: r._sum.costImpact ?? 0,
          scheduleDays: r._sum.scheduleDaysImpact ?? 0,
          laborHours: r._sum.laborHoursImpact ?? 0,
        }));
        const fcoRows = fcoByStatus.map((r) => ({
          status: r.status as FcoStatus,
          count: r._count._all,
          cost: r._sum.estimatedCost ?? 0,
        }));
        const rfiRows = rfiByStatus.map((r) => ({
          status: r.status as RfiStatus,
          count: r._count._all,
        }));
        const cvrTotal = sumOver(cvrRows, null, (r) => r.count);
        const cvrOpen = sumOver(cvrRows, CVR_OPEN_STATUSES, (r) => r.count);
        const cvrNetCost = sumOver(cvrRows, null, (r) => r.cost);
        const cvrApprovedCost = sumOver(
          cvrRows,
          ["APPROVED", "EXECUTED"],
          (r) => r.cost,
        );
        const cvrScheduleDays = sumOver(cvrRows, null, (r) => r.scheduleDays);
        const cvrLaborHours = sumOver(cvrRows, null, (r) => r.laborHours);
        const cvrPendingApproval = sumOver(
          cvrRows,
          ["PENDING_APPROVAL"],
          (r) => r.count,
        );
        const fcoTotal = sumOver(fcoRows, null, (r) => r.count);
        const fcoOpen = sumOver(fcoRows, FCO_OPEN_STATUSES, (r) => r.count);
        const fcoEstCost = sumOver(fcoRows, null, (r) => r.cost);
        const rfiTotal = sumOver(rfiRows, null, (r) => r.count);
        const rfiOpen = sumOver(rfiRows, RFI_OPEN_STATUSES, (r) => r.count);
        const rfiAnswered = sumOver(rfiRows, ["ANSWERED"], (r) => r.count);

        // Project the unordered Prisma `groupBy` results into the lifecycle-
        // ordered shapes the dashboard expects. Statuses with zero rows are
        // filtered out by the trailing `.filter(...count > 0)` so dashboards
        // for new projects don't show empty rows for every possible status.
        const cvrStatusMap = new Map(
          cvrRows.map((r) => [r.status, { count: r.count, cost: r.cost }]),
        );
        const cvrRiskMap = new Map(
          cvrByRisk.map((r) => [r.riskLevel as RiskLevel, r._count._all]),
        );
        const fcoStatusMap = new Map(
          fcoRows.map((r) => [r.status, { count: r.count, cost: r.cost }]),
        );
        const rfiStatusMap = new Map(rfiRows.map((r) => [r.status, r.count]));

        return {
          cvr: {
            total: cvrTotal,
            open: cvrOpen,
            netCost: cvrNetCost,
            approvedCost: cvrApprovedCost,
            scheduleDays: cvrScheduleDays,
            laborHours: cvrLaborHours,
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
            total: fcoTotal,
            open: fcoOpen,
            estCost: fcoEstCost,
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
      },
    ),
  );

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

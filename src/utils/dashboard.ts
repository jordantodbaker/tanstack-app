import {
  CHANGE_STATUSES,
  CVR_OPEN_STATUSES,
  RISK_LEVELS,
  type ChangeLogItem,
  type ChangeStatus,
  type RiskLevel,
} from "./changelog";
import {
  FCO_STATUSES,
  FCO_OPEN_STATUSES,
  type FcoItem,
  type FcoStatus,
} from "./fcoLog";
import {
  RFI_STATUSES,
  RFI_OPEN_STATUSES,
  type RfiItem,
  type RfiStatus,
} from "./rfis";

/**
 * Pure, client-safe rollup math for the project dashboard. Kept separate from
 * the route component so the aggregation can be unit-tested without React.
 * These functions only read the serialized list shapes already returned by
 * `changeLogListQueryOptions` / `fcoListQueryOptions`.
 */

export type StatusBucket<S extends string> = {
  status: S;
  count: number;
  cost: number;
};

export type CvrSummary = {
  total: number;
  open: number;
  /** Sum of cost impact across every CVR, regardless of status. */
  netCost: number;
  /** Cost impact of CVRs that have reached APPROVED or EXECUTED. */
  approvedCost: number;
  scheduleDays: number;
  laborHours: number;
  /** Per-status buckets in lifecycle order; statuses with no rows are omitted. */
  byStatus: StatusBucket<ChangeStatus>[];
  byRisk: { level: RiskLevel; count: number }[];
  /** Cost impact grouped by discipline id, ordered by magnitude. */
  byDiscipline: { discipline: string; cost: number }[];
};

export function summarizeCvrs(items: ChangeLogItem[]): CvrSummary {
  const sum = (rows: ChangeLogItem[], pick: (c: ChangeLogItem) => number) =>
    rows.reduce((acc, c) => acc + pick(c), 0);

  const discMap = new Map<string, number>();
  for (const c of items) {
    discMap.set(c.discipline, (discMap.get(c.discipline) ?? 0) + c.costImpact);
  }

  return {
    total: items.length,
    open: items.filter((c) => CVR_OPEN_STATUSES.includes(c.status)).length,
    netCost: sum(items, (c) => c.costImpact),
    approvedCost: sum(
      items.filter((c) => c.status === "APPROVED" || c.status === "EXECUTED"),
      (c) => c.costImpact,
    ),
    scheduleDays: sum(items, (c) => c.scheduleDaysImpact),
    laborHours: sum(items, (c) => c.laborHoursImpact),
    byStatus: CHANGE_STATUSES.map((status) => {
      const rows = items.filter((c) => c.status === status);
      return {
        status,
        count: rows.length,
        cost: sum(rows, (c) => c.costImpact),
      };
    }).filter((b) => b.count > 0),
    byRisk: RISK_LEVELS.map((level) => ({
      level,
      count: items.filter((c) => c.riskLevel === level).length,
    })).filter((b) => b.count > 0),
    byDiscipline: [...discMap.entries()]
      .map(([discipline, cost]) => ({ discipline, cost }))
      .sort((a, b) => Math.abs(b.cost) - Math.abs(a.cost)),
  };
}

export type FcoSummary = {
  total: number;
  open: number;
  estCost: number;
  /** Open FCOs flagged as having stopped field work. */
  workStopped: number;
  byStatus: StatusBucket<FcoStatus>[];
};

export function summarizeFcos(items: FcoItem[]): FcoSummary {
  return {
    total: items.length,
    open: items.filter((f) => FCO_OPEN_STATUSES.includes(f.status)).length,
    estCost: items.reduce((acc, f) => acc + f.estimatedCost, 0),
    workStopped: items.filter(
      (f) => f.workStopped && FCO_OPEN_STATUSES.includes(f.status),
    ).length,
    byStatus: FCO_STATUSES.map((status) => {
      const rows = items.filter((f) => f.status === status);
      return {
        status,
        count: rows.length,
        cost: rows.reduce((acc, f) => acc + f.estimatedCost, 0),
      };
    }).filter((b) => b.count > 0),
  };
}

export type RfiSummary = {
  total: number;
  open: number;
  /** Status === ANSWERED — responder posted an answer, originator hasn't closed. */
  awaitingClose: number;
  /** Open with `dueDate` in the past. */
  pastDue: number;
  /** Open with either suspect-impact flag set — early signal of FCO/CVR coming. */
  suspectsImpact: number;
  byStatus: { status: RfiStatus; count: number }[];
};

export function summarizeRfis(
  items: RfiItem[],
  now: Date = new Date(),
): RfiSummary {
  return {
    total: items.length,
    open: items.filter((r) => RFI_OPEN_STATUSES.includes(r.status)).length,
    awaitingClose: items.filter((r) => r.status === "ANSWERED").length,
    pastDue: items.filter(
      (r) => RFI_OPEN_STATUSES.includes(r.status) && isPast(r.dueDate, now),
    ).length,
    suspectsImpact: items.filter(
      (r) =>
        RFI_OPEN_STATUSES.includes(r.status) &&
        (r.suspectsCostImpact || r.suspectsScheduleImpact),
    ).length,
    byStatus: RFI_STATUSES.map((status) => ({
      status,
      count: items.filter((r) => r.status === status).length,
    })).filter((b) => b.count > 0),
  };
}

/** True when an ISO date string falls before the start of `now`'s day. */
export function isPast(
  dateStr: string | null,
  now: Date = new Date(),
): boolean {
  if (!dateStr) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(dateStr) < startOfToday;
}

export type AttentionSummary = {
  pendingApproval: number;
  overdueCvr: number;
  overdueFco: number;
  workStopped: number;
  rfiAwaitingClose: number;
  rfiPastDue: number;
};

/**
 * Counts the actionable items surfaced in the dashboard's "needs attention"
 * panel. `now` is injectable so the overdue logic is deterministic in tests.
 * `rfis` defaults to an empty array so existing two-argument callers keep
 * working — RFI counts simply collapse to zero.
 */
export function summarizeAttention(
  cvrs: ChangeLogItem[],
  fcos: FcoItem[],
  now: Date = new Date(),
  rfis: RfiItem[] = [],
): AttentionSummary {
  return {
    pendingApproval: cvrs.filter((c) => c.status === "PENDING_APPROVAL")
      .length,
    overdueCvr: cvrs.filter(
      (c) => CVR_OPEN_STATUSES.includes(c.status) && isPast(c.dueDate, now),
    ).length,
    overdueFco: fcos.filter(
      (f) => FCO_OPEN_STATUSES.includes(f.status) && isPast(f.neededBy, now),
    ).length,
    workStopped: fcos.filter(
      (f) => f.workStopped && FCO_OPEN_STATUSES.includes(f.status),
    ).length,
    rfiAwaitingClose: rfis.filter((r) => r.status === "ANSWERED").length,
    rfiPastDue: rfis.filter(
      (r) => RFI_OPEN_STATUSES.includes(r.status) && isPast(r.dueDate, now),
    ).length,
  };
}

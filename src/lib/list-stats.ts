import { isPast } from "./dates";
import { CVR_OPEN_STATUSES, type ChangeStatus } from "~/utils/changelog";
import { FCO_OPEN_STATUSES, type FcoStatus } from "~/utils/fcoLog";
import { RFI_OPEN_STATUSES, type RfiStatus } from "~/utils/rfis";
import { PCO_OPEN_STATUSES, type PcoStatus } from "~/utils/pco";
import {
  TREND_ACTIVE_STATUSES,
  trendForecastContribution,
  type TrendStatus,
} from "~/utils/trends";

/**
 * Stat-card roll-ups for the five change-pipeline list pages.
 *
 * These lived inline as a `React.useMemo` in each route, which made them
 * untestable and meant each one walked the array four or five times (one
 * `filter().length` per card, plus a `reduce`). They're pure functions over
 * the list, so they belong here: one pass each, and the counting rules —
 * which statuses are "open", what counts as past due, which amount column a
 * bucket sums — become assertable.
 *
 * Parameters are minimal structural shapes rather than the full `*ListItem`
 * types, matching `trendForecastContribution`'s existing convention. Call
 * sites still typecheck against the real list items; tests can build a row
 * from just the fields the rule reads.
 *
 * `now` is passed in rather than read from the clock so past-due boundaries
 * are deterministic under test.
 */

export type CvrStats = {
  totalCost: number;
  approvedCost: number;
  openCount: number;
  executedCount: number;
};

/** `approvedCost` counts EXECUTED as well as APPROVED — an executed CVR is
 *  approved work that has since been carried out, not a separate bucket. */
export function computeCvrStats(
  items: readonly { status: ChangeStatus; costImpact: number }[],
): CvrStats {
  let totalCost = 0;
  let approvedCost = 0;
  let openCount = 0;
  let executedCount = 0;
  for (const i of items) {
    totalCost += i.costImpact;
    if (i.status === "APPROVED" || i.status === "EXECUTED") {
      approvedCost += i.costImpact;
    }
    if (i.status === "EXECUTED") executedCount++;
    if (CVR_OPEN_STATUSES.includes(i.status)) openCount++;
  }
  return { totalCost, approvedCost, openCount, executedCount };
}

export type FcoStats = {
  openCount: number;
  linkedCount: number;
  urgentCount: number;
  workStopped: number;
  totalCost: number;
};

/** `urgentCount` and `workStopped` only count rows still open — a closed FCO
 *  that was once urgent isn't something the field needs to act on. */
export function computeFcoStats(
  items: readonly {
    status: FcoStatus;
    priority: string;
    workStopped: boolean;
    linkedCvrId: number | null;
    estimatedCost: number;
  }[],
): FcoStats {
  let openCount = 0;
  let linkedCount = 0;
  let urgentCount = 0;
  let workStopped = 0;
  let totalCost = 0;
  for (const i of items) {
    totalCost += i.estimatedCost;
    if (i.linkedCvrId !== null) linkedCount++;
    const isOpen = FCO_OPEN_STATUSES.includes(i.status);
    if (!isOpen) continue;
    openCount++;
    if (i.priority === "URGENT" || i.priority === "HIGH" || i.workStopped) {
      urgentCount++;
    }
    if (i.workStopped) workStopped++;
  }
  return { openCount, linkedCount, urgentCount, workStopped, totalCost };
}

export type RfiStats = {
  openCount: number;
  awaitingClose: number;
  pastDue: number;
  suspectsImpact: number;
};

export function computeRfiStats(
  items: readonly {
    status: RfiStatus;
    dueDate: string | null;
    suspectsCostImpact: boolean;
    suspectsScheduleImpact: boolean;
  }[],
  now: Date,
): RfiStats {
  let openCount = 0;
  let awaitingClose = 0;
  let pastDue = 0;
  let suspectsImpact = 0;
  for (const i of items) {
    if (i.status === "ANSWERED") awaitingClose++;
    if (!RFI_OPEN_STATUSES.includes(i.status)) continue;
    openCount++;
    if (isPast(i.dueDate, now)) pastDue++;
    if (i.suspectsCostImpact || i.suspectsScheduleImpact) suspectsImpact++;
  }
  return { openCount, awaitingClose, pastDue, suspectsImpact };
}

export type PcoStats = {
  openCount: number;
  openValue: number;
  approvedCount: number;
  approvedValue: number;
  invoicedCount: number;
  invoicedValue: number;
  closedCount: number;
  closedValue: number;
};

/**
 * Note the deliberate asymmetry: the open bucket sums `requestedAmount` (what
 * we're chasing approval on), while approved/invoiced/closed sum
 * `approvedAmount` (the number the owner actually agreed to).
 */
export function computePcoStats(
  items: readonly {
    status: PcoStatus;
    requestedAmount: number;
    approvedAmount: number;
  }[],
): PcoStats {
  const s: PcoStats = {
    openCount: 0,
    openValue: 0,
    approvedCount: 0,
    approvedValue: 0,
    invoicedCount: 0,
    invoicedValue: 0,
    closedCount: 0,
    closedValue: 0,
  };
  for (const i of items) {
    if (PCO_OPEN_STATUSES.includes(i.status)) {
      s.openCount++;
      s.openValue += i.requestedAmount;
    }
    if (i.status === "APPROVED") {
      s.approvedCount++;
      s.approvedValue += i.approvedAmount;
    } else if (i.status === "INVOICED") {
      s.invoicedCount++;
      s.invoicedValue += i.approvedAmount;
    } else if (i.status === "CLOSED") {
      s.closedCount++;
      s.closedValue += i.approvedAmount;
    }
  }
  return s;
}

export type TrendStats = {
  activeCount: number;
  pastDue: number;
  totalForecast: number;
  totalExposure: number;
  probableCount: number;
};

/**
 * `totalForecast` is the probability-weighted AFC contribution (matching the
 * per-bucket roll-up on the reporting page); `totalExposure` is the unweighted
 * likely cost — what AFC becomes if every active trend lands at full value.
 */
export function computeTrendStats(
  items: readonly {
    status: TrendStatus;
    probability: number;
    costLikely: number;
    neededBy: string | null;
  }[],
  now: Date,
): TrendStats {
  let activeCount = 0;
  let pastDue = 0;
  let totalForecast = 0;
  let totalExposure = 0;
  let probableCount = 0;
  for (const i of items) {
    if (i.status === "PROBABLE") probableCount++;
    if (!TREND_ACTIVE_STATUSES.includes(i.status)) continue;
    activeCount++;
    if (isPast(i.neededBy, now)) pastDue++;
    totalForecast += trendForecastContribution({
      status: i.status,
      probability: i.probability,
      costLikely: i.costLikely,
    });
    totalExposure += i.costLikely;
  }
  return { activeCount, pastDue, totalForecast, totalExposure, probableCount };
}

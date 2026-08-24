import { describe, expect, it } from "vitest";
import {
  computeCvrStats,
  computeFcoStats,
  computePcoStats,
  computeRfiStats,
  computeTrendStats,
} from "./list-stats";

/**
 * These roll-ups drive the stat cards on the five list pages. The rules worth
 * pinning are the ones that aren't obvious from the card labels: which
 * statuses count as "open", whether a bucket is exclusive, and which amount
 * column each bucket sums.
 *
 * `now` is fixed so past-due boundaries don't drift.
 */
const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("computeCvrStats", () => {
  it("counts open statuses and sums cost impact", () => {
    const stats = computeCvrStats([
      { status: "REQUESTED", costImpact: 100 },
      { status: "IN_REVIEW", costImpact: 200 },
      { status: "PENDING_APPROVAL", costImpact: 50 },
      { status: "VOID", costImpact: 999 },
    ]);
    expect(stats.openCount).toBe(3);
    expect(stats.totalCost).toBe(1349);
  });

  it("counts EXECUTED toward approved cost as well as APPROVED", () => {
    // An executed CVR is approved work that has since been carried out — it
    // must not drop out of the approved-dollars card.
    const stats = computeCvrStats([
      { status: "APPROVED", costImpact: 100 },
      { status: "EXECUTED", costImpact: 250 },
      { status: "REJECTED", costImpact: 500 },
    ]);
    expect(stats.approvedCost).toBe(350);
    expect(stats.executedCount).toBe(1);
  });

  it("keeps negative cost impacts (credits) in the totals", () => {
    const stats = computeCvrStats([
      { status: "APPROVED", costImpact: 500 },
      { status: "APPROVED", costImpact: -200 },
    ]);
    expect(stats.totalCost).toBe(300);
    expect(stats.approvedCost).toBe(300);
  });

  it("returns zeroes for an empty list", () => {
    expect(computeCvrStats([])).toEqual({
      totalCost: 0,
      approvedCost: 0,
      openCount: 0,
      executedCount: 0,
    });
  });
});

describe("computeFcoStats", () => {
  const row = {
    status: "SUBMITTED" as const,
    priority: "NORMAL",
    workStopped: false,
    linkedCvrId: null,
    estimatedCost: 0,
  };

  it("treats HIGH, URGENT or work-stopped as urgent", () => {
    const stats = computeFcoStats([
      { ...row, priority: "URGENT" },
      { ...row, priority: "HIGH" },
      { ...row, priority: "LOW", workStopped: true },
      { ...row, priority: "NORMAL" },
    ]);
    expect(stats.urgentCount).toBe(3);
  });

  it("only counts urgent and work-stopped among OPEN rows", () => {
    // A closed FCO that was once urgent isn't something the field must act on.
    const stats = computeFcoStats([
      { ...row, status: "CLOSED", priority: "URGENT", workStopped: true },
    ]);
    expect(stats.openCount).toBe(0);
    expect(stats.urgentCount).toBe(0);
    expect(stats.workStopped).toBe(0);
  });

  it("counts links and sums cost across ALL rows, open or not", () => {
    const stats = computeFcoStats([
      { ...row, status: "CLOSED", linkedCvrId: 3, estimatedCost: 100 },
      { ...row, status: "SUBMITTED", linkedCvrId: null, estimatedCost: 50 },
    ]);
    expect(stats.linkedCount).toBe(1);
    expect(stats.totalCost).toBe(150);
  });
});

describe("computeRfiStats", () => {
  const row = {
    status: "OPEN" as const,
    dueDate: null,
    suspectsCostImpact: false,
    suspectsScheduleImpact: false,
  };

  it("counts an RFI past due only while it is still open", () => {
    const overdue = "2026-06-01T00:00:00.000Z";
    const stats = computeRfiStats(
      [
        { ...row, status: "OPEN", dueDate: overdue },
        { ...row, status: "CLOSED", dueDate: overdue },
      ],
      NOW,
    );
    expect(stats.pastDue).toBe(1);
  });

  it("does not count a future due date as past due", () => {
    const stats = computeRfiStats(
      [{ ...row, dueDate: "2026-07-01T00:00:00.000Z" }],
      NOW,
    );
    expect(stats.pastDue).toBe(0);
  });

  it("counts ANSWERED as both open and awaiting close", () => {
    const stats = computeRfiStats([{ ...row, status: "ANSWERED" }], NOW);
    expect(stats.awaitingClose).toBe(1);
    expect(stats.openCount).toBe(1);
  });

  it("counts a row suspecting either cost or schedule impact exactly once", () => {
    const stats = computeRfiStats(
      [{ ...row, suspectsCostImpact: true, suspectsScheduleImpact: true }],
      NOW,
    );
    expect(stats.suspectsImpact).toBe(1);
  });
});

describe("computePcoStats", () => {
  it("sums requestedAmount for open but approvedAmount for the rest", () => {
    // The asymmetry is deliberate: open is what we're chasing approval on,
    // the later buckets are what the owner actually agreed to.
    const stats = computePcoStats([
      { status: "SUBMITTED", requestedAmount: 1000, approvedAmount: 0 },
      { status: "APPROVED", requestedAmount: 900, approvedAmount: 800 },
      { status: "INVOICED", requestedAmount: 700, approvedAmount: 600 },
      { status: "CLOSED", requestedAmount: 500, approvedAmount: 400 },
    ]);
    expect(stats.openValue).toBe(1000);
    expect(stats.approvedValue).toBe(800);
    expect(stats.invoicedValue).toBe(600);
    expect(stats.closedValue).toBe(400);
  });

  it("keeps the post-approval buckets mutually exclusive", () => {
    const stats = computePcoStats([
      { status: "INVOICED", requestedAmount: 0, approvedAmount: 100 },
    ]);
    expect(stats.invoicedCount).toBe(1);
    expect(stats.approvedCount).toBe(0);
    expect(stats.closedCount).toBe(0);
  });

  it("excludes terminal REJECTED / VOID rows from every bucket", () => {
    const stats = computePcoStats([
      { status: "REJECTED", requestedAmount: 100, approvedAmount: 100 },
      { status: "VOID", requestedAmount: 100, approvedAmount: 100 },
    ]);
    expect(stats).toEqual({
      openCount: 0,
      openValue: 0,
      approvedCount: 0,
      approvedValue: 0,
      invoicedCount: 0,
      invoicedValue: 0,
      closedCount: 0,
      closedValue: 0,
    });
  });
});

describe("computeTrendStats", () => {
  const row = {
    status: "IDENTIFIED" as const,
    probability: 0.5,
    costLikely: 1000,
    neededBy: null,
  };

  it("weights forecast by probability but leaves exposure unweighted", () => {
    const stats = computeTrendStats([{ ...row, probability: 0.25 }], NOW);
    expect(stats.totalForecast).toBe(250);
    expect(stats.totalExposure).toBe(1000);
  });

  it("counts only IDENTIFIED and PROBABLE as active", () => {
    const stats = computeTrendStats(
      [
        { ...row, status: "IDENTIFIED" },
        { ...row, status: "PROBABLE" },
        { ...row, status: "CONVERTED" },
        { ...row, status: "REJECTED" },
        { ...row, status: "VOID" },
      ],
      NOW,
    );
    expect(stats.activeCount).toBe(2);
    // A converted trend is already in currentBudget via its CVR, so counting
    // it again here would double-count it in AFC.
    expect(stats.totalExposure).toBe(2000);
  });

  it("counts PROBABLE rows regardless of the active filter", () => {
    const stats = computeTrendStats([{ ...row, status: "PROBABLE" }], NOW);
    expect(stats.probableCount).toBe(1);
  });

  it("counts past due only among active trends", () => {
    const overdue = "2026-01-01T00:00:00.000Z";
    const stats = computeTrendStats(
      [
        { ...row, status: "IDENTIFIED", neededBy: overdue },
        { ...row, status: "REJECTED", neededBy: overdue },
      ],
      NOW,
    );
    expect(stats.pastDue).toBe(1);
  });
});

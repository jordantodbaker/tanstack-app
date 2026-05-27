import { describe, expect, it } from "vitest";
import type { ChangeLogItem } from "./changelog";
import type { FcoItem } from "./fcoLog";
import type { RfiItem } from "./rfis";
import {
  isPast,
  summarizeAttention,
  summarizeCvrs,
  summarizeFcos,
  summarizeRfis,
} from "./dashboard";

// Minimal factories — every field carries a harmless default so each test
// overrides only the columns the rollup actually reads.
function cvr(partial: Partial<ChangeLogItem> = {}): ChangeLogItem {
  return {
    id: 1,
    projectId: 1,
    cvrNumber: "CVR-001",
    title: "Test CVR",
    description: "",
    status: "REQUESTED",
    type: "SCOPE",
    discipline: "piping",
    cbsCodes: [],
    originator: "",
    costImpact: 0,
    scheduleDaysImpact: 0,
    laborHoursImpact: 0,
    riskLevel: "LOW",
    reasonCode: "",
    requestedAt: "2026-01-01T00:00:00.000Z",
    dueDate: null,
    approvedAt: null,
    approver: "",
    notes: "",
    area: "",
    createdById: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function fco(partial: Partial<FcoItem> = {}): FcoItem {
  return {
    id: 1,
    projectId: 1,
    fcoNumber: "FCO-001",
    title: "Test FCO",
    description: "",
    status: "DRAFT",
    originType: "FIELD_CONDITION",
    priority: "NORMAL",
    discipline: "piping",
    cbsCodes: [],
    locationArea: "",
    drawingRefs: [],
    rfiNumbers: [],
    initiatedBy: "",
    fieldContact: "",
    estimatedCost: 0,
    estimatedHours: 0,
    workStopped: false,
    photosUrl: "",
    reasonNarrative: "",
    resolution: "",
    notes: "",
    initiatedAt: "2026-01-01T00:00:00.000Z",
    neededBy: null,
    closedAt: null,
    linkedCvrId: null,
    linkedCvrNumber: null,
    linkedCvrTitle: null,
    linkedRfiId: null,
    linkedRfiNumber: null,
    linkedRfiSubject: null,
    createdById: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function rfi(partial: Partial<RfiItem> = {}): RfiItem {
  return {
    id: 1,
    projectId: 1,
    rfiNumber: "RFI-001",
    subject: "Test RFI",
    question: "",
    status: "OPEN",
    priority: "NORMAL",
    discipline: "piping",
    cbsCodes: [],
    locationArea: "",
    drawingRefs: [],
    specRefs: [],
    suspectsCostImpact: false,
    suspectsScheduleImpact: false,
    initiatedBy: "",
    assignedTo: "",
    dueDate: null,
    initiatedAt: "2026-01-01T00:00:00.000Z",
    response: "",
    answeredBy: "",
    answeredAt: null,
    closedAt: null,
    createdById: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    linkedFcos: [],
    ...partial,
  };
}

describe("summarizeCvrs", () => {
  it("returns zeroed totals and empty buckets for no records", () => {
    const s = summarizeCvrs([]);
    expect(s).toMatchObject({
      total: 0,
      open: 0,
      netCost: 0,
      approvedCost: 0,
      scheduleDays: 0,
      laborHours: 0,
    });
    expect(s.byStatus).toEqual([]);
    expect(s.byRisk).toEqual([]);
    expect(s.byDiscipline).toEqual([]);
  });

  it("counts only in-flight statuses as open", () => {
    const s = summarizeCvrs([
      cvr({ status: "REQUESTED" }),
      cvr({ status: "IN_REVIEW" }),
      cvr({ status: "PENDING_APPROVAL" }),
      cvr({ status: "APPROVED" }),
      cvr({ status: "EXECUTED" }),
      cvr({ status: "VOID" }),
    ]);
    expect(s.total).toBe(6);
    expect(s.open).toBe(3);
  });

  it("sums net cost across all CVRs but approved cost only for APPROVED/EXECUTED", () => {
    const s = summarizeCvrs([
      cvr({ status: "REQUESTED", costImpact: 100 }),
      cvr({ status: "APPROVED", costImpact: 200 }),
      cvr({ status: "EXECUTED", costImpact: 50 }),
      cvr({ status: "REJECTED", costImpact: 999 }),
    ]);
    expect(s.netCost).toBe(1349);
    expect(s.approvedCost).toBe(250);
  });

  it("sums schedule-day and labor-hour impact", () => {
    const s = summarizeCvrs([
      cvr({ scheduleDaysImpact: 3, laborHoursImpact: 40 }),
      cvr({ scheduleDaysImpact: -1, laborHoursImpact: 10 }),
    ]);
    expect(s.scheduleDays).toBe(2);
    expect(s.laborHours).toBe(50);
  });

  it("buckets by status in lifecycle order, omitting empty statuses", () => {
    const s = summarizeCvrs([
      cvr({ status: "APPROVED", costImpact: 10 }),
      cvr({ status: "REQUESTED", costImpact: 5 }),
      cvr({ status: "REQUESTED", costImpact: 7 }),
    ]);
    expect(s.byStatus).toEqual([
      { status: "REQUESTED", count: 2, cost: 12 },
      { status: "APPROVED", count: 1, cost: 10 },
    ]);
  });

  it("buckets by risk level, omitting levels with no rows", () => {
    const s = summarizeCvrs([
      cvr({ riskLevel: "CRITICAL" }),
      cvr({ riskLevel: "LOW" }),
      cvr({ riskLevel: "LOW" }),
    ]);
    expect(s.byRisk).toEqual([
      { level: "LOW", count: 2 },
      { level: "CRITICAL", count: 1 },
    ]);
  });

  it("groups cost by discipline, ordered by magnitude", () => {
    const s = summarizeCvrs([
      cvr({ discipline: "civil", costImpact: 100 }),
      cvr({ discipline: "piping", costImpact: -500 }),
      cvr({ discipline: "civil", costImpact: 50 }),
    ]);
    expect(s.byDiscipline).toEqual([
      { discipline: "piping", cost: -500 },
      { discipline: "civil", cost: 150 },
    ]);
  });
});

describe("summarizeFcos", () => {
  it("returns zeroed totals for no records", () => {
    const s = summarizeFcos([]);
    expect(s).toMatchObject({ total: 0, open: 0, estCost: 0, workStopped: 0 });
    expect(s.byStatus).toEqual([]);
  });

  it("counts open statuses and sums estimated cost", () => {
    const s = summarizeFcos([
      fco({ status: "DRAFT", estimatedCost: 100 }),
      fco({ status: "SUBMITTED", estimatedCost: 200 }),
      fco({ status: "CLOSED", estimatedCost: 50 }),
    ]);
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    expect(s.estCost).toBe(350);
  });

  it("counts work-stopped only for FCOs that are still open", () => {
    const s = summarizeFcos([
      fco({ status: "SUBMITTED", workStopped: true }),
      fco({ status: "CLOSED", workStopped: true }),
      fco({ status: "DRAFT", workStopped: false }),
    ]);
    expect(s.workStopped).toBe(1);
  });
});

describe("summarizeRfis", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");

  it("returns zeroed totals and empty buckets for no records", () => {
    const s = summarizeRfis([], now);
    expect(s).toMatchObject({
      total: 0,
      open: 0,
      awaitingClose: 0,
      pastDue: 0,
      suspectsImpact: 0,
    });
    expect(s.byStatus).toEqual([]);
  });

  it("counts only in-flight statuses as open", () => {
    const s = summarizeRfis(
      [
        rfi({ status: "DRAFT" }),
        rfi({ status: "OPEN" }),
        rfi({ status: "ANSWERED" }),
        rfi({ status: "CLOSED" }),
        rfi({ status: "SUPERSEDED" }),
        rfi({ status: "VOID" }),
      ],
      now,
    );
    expect(s.total).toBe(6);
    expect(s.open).toBe(3);
  });

  it("counts awaitingClose as just the ANSWERED bucket", () => {
    const s = summarizeRfis(
      [
        rfi({ status: "ANSWERED" }),
        rfi({ status: "ANSWERED" }),
        rfi({ status: "OPEN" }),
      ],
      now,
    );
    expect(s.awaitingClose).toBe(2);
  });

  it("counts pastDue only for open RFIs with a due date in the past", () => {
    const s = summarizeRfis(
      [
        rfi({ status: "OPEN", dueDate: "2026-05-01T00:00:00.000Z" }),
        rfi({ status: "CLOSED", dueDate: "2026-05-01T00:00:00.000Z" }),
        rfi({ status: "OPEN", dueDate: "2026-06-01T00:00:00.000Z" }),
      ],
      now,
    );
    expect(s.pastDue).toBe(1);
  });

  it("counts suspectsImpact only when the RFI is open and at least one flag is set", () => {
    const s = summarizeRfis(
      [
        rfi({ status: "OPEN", suspectsCostImpact: true }),
        rfi({ status: "OPEN", suspectsScheduleImpact: true }),
        rfi({
          status: "OPEN",
          suspectsCostImpact: true,
          suspectsScheduleImpact: true,
        }),
        rfi({ status: "CLOSED", suspectsCostImpact: true }),
        rfi({ status: "OPEN" }),
      ],
      now,
    );
    expect(s.suspectsImpact).toBe(3);
  });

  it("buckets by status in lifecycle order, omitting empty statuses", () => {
    const s = summarizeRfis(
      [
        rfi({ status: "CLOSED" }),
        rfi({ status: "OPEN" }),
        rfi({ status: "OPEN" }),
      ],
      now,
    );
    expect(s.byStatus).toEqual([
      { status: "OPEN", count: 2 },
      { status: "CLOSED", count: 1 },
    ]);
  });
});

describe("isPast", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");

  it("treats a null date as not past", () => {
    expect(isPast(null, now)).toBe(false);
  });

  it("flags a date before today", () => {
    expect(isPast("2026-05-20T23:00:00.000Z", now)).toBe(true);
  });

  it("does not flag a future date", () => {
    expect(isPast("2026-05-22T01:00:00.000Z", now)).toBe(false);
  });
});

describe("summarizeAttention", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");

  it("counts CVRs awaiting approval", () => {
    const s = summarizeAttention(
      [
        cvr({ status: "PENDING_APPROVAL" }),
        cvr({ status: "PENDING_APPROVAL" }),
        cvr({ status: "APPROVED" }),
      ],
      [],
      now,
    );
    expect(s.pendingApproval).toBe(2);
  });

  it("counts overdue CVRs only when open and past due", () => {
    const s = summarizeAttention(
      [
        cvr({ status: "IN_REVIEW", dueDate: "2026-05-01T00:00:00.000Z" }),
        cvr({ status: "EXECUTED", dueDate: "2026-05-01T00:00:00.000Z" }),
        cvr({ status: "REQUESTED", dueDate: "2026-06-01T00:00:00.000Z" }),
      ],
      [],
      now,
    );
    expect(s.overdueCvr).toBe(1);
  });

  it("counts overdue FCOs and open work-stopped FCOs", () => {
    const s = summarizeAttention(
      [],
      [
        fco({ status: "SUBMITTED", neededBy: "2026-05-01T00:00:00.000Z" }),
        fco({ status: "CLOSED", neededBy: "2026-05-01T00:00:00.000Z" }),
        fco({ status: "IN_REVIEW", workStopped: true }),
      ],
      now,
    );
    expect(s.overdueFco).toBe(1);
    expect(s.workStopped).toBe(1);
  });

  it("defaults RFI counts to zero when no rfis are passed", () => {
    const s = summarizeAttention([], [], now);
    expect(s.rfiAwaitingClose).toBe(0);
    expect(s.rfiPastDue).toBe(0);
  });

  it("counts answered RFIs awaiting close, and open RFIs past their due date", () => {
    const s = summarizeAttention(
      [],
      [],
      now,
      [
        rfi({ status: "ANSWERED" }),
        rfi({ status: "ANSWERED" }),
        rfi({ status: "OPEN", dueDate: "2026-05-01T00:00:00.000Z" }),
        rfi({ status: "CLOSED", dueDate: "2026-05-01T00:00:00.000Z" }),
      ],
    );
    expect(s.rfiAwaitingClose).toBe(2);
    expect(s.rfiPastDue).toBe(1);
  });
});

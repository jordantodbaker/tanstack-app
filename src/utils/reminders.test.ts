import { describe, expect, it } from "vitest";
import type { ChangeLogItem } from "./changelog";
import type { FcoItem } from "./fcoLog";
import type { RfiItem } from "./rfis";
import {
  selectReminders,
  type SelectRemindersInput,
} from "./reminders";

// Minimal factories — mirror the dashboard.test factories.
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
    createdById: 7,
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
    createdById: 7,
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
    createdById: 7,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    linkedFcos: [],
    ...partial,
  };
}

const NOW = new Date("2026-05-21T12:00:00.000Z");
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function input(
  overrides: Partial<SelectRemindersInput> = {},
): SelectRemindersInput {
  return {
    projectId: 1,
    cvrs: [],
    fcos: [],
    rfis: [],
    reviewerUserIds: [],
    adminUserIds: [],
    recentReminders: new Set(),
    now: NOW,
    ...overrides,
  };
}

describe("selectReminders", () => {
  describe("CVR_PENDING_APPROVAL_STALE", () => {
    it("fires when PENDING_APPROVAL has been stale > 3 days", () => {
      const out = selectReminders(
        input({
          cvrs: [
            cvr({ status: "PENDING_APPROVAL", updatedAt: daysAgo(4) }),
          ],
          reviewerUserIds: [10, 11],
        }),
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        reminderType: "CVR_PENDING_APPROVAL_STALE",
        entityType: "ChangeLog",
        entityId: 1,
        recipientUserIds: [7, 10, 11],
      });
      expect(out[0].message).toMatch(/4 days/);
    });

    it("does not fire under the 3-day threshold", () => {
      expect(
        selectReminders(
          input({
            cvrs: [
              cvr({ status: "PENDING_APPROVAL", updatedAt: daysAgo(2) }),
            ],
            reviewerUserIds: [10],
          }),
        ),
      ).toEqual([]);
    });

    it("does not fire for non-PENDING_APPROVAL statuses", () => {
      expect(
        selectReminders(
          input({
            cvrs: [cvr({ status: "APPROVED", updatedAt: daysAgo(30) })],
            reviewerUserIds: [10],
          }),
        ),
      ).toEqual([]);
    });

    it("omits a recipient already pinged today (dedup)", () => {
      const out = selectReminders(
        input({
          cvrs: [
            cvr({ id: 42, status: "PENDING_APPROVAL", updatedAt: daysAgo(5) }),
          ],
          reviewerUserIds: [10, 11],
          recentReminders: new Set([
            "CVR_PENDING_APPROVAL_STALE|42|10",
          ]),
        }),
      );
      expect(out[0].recipientUserIds).toEqual([7, 11]);
    });

    it("drops the whole reminder when every candidate is deduped", () => {
      expect(
        selectReminders(
          input({
            cvrs: [
              cvr({
                id: 42,
                status: "PENDING_APPROVAL",
                updatedAt: daysAgo(5),
                createdById: null,
              }),
            ],
            reviewerUserIds: [10],
            recentReminders: new Set([
              "CVR_PENDING_APPROVAL_STALE|42|10",
            ]),
          }),
        ),
      ).toEqual([]);
    });

    it("handles a null originator (record predates the column)", () => {
      const out = selectReminders(
        input({
          cvrs: [
            cvr({
              status: "PENDING_APPROVAL",
              updatedAt: daysAgo(5),
              createdById: null,
            }),
          ],
          reviewerUserIds: [10, 11],
        }),
      );
      expect(out[0].recipientUserIds).toEqual([10, 11]);
    });
  });

  describe("CVR_IN_REVIEW_STALE", () => {
    it("fires when IN_REVIEW has been stale > 7 days", () => {
      const out = selectReminders(
        input({
          cvrs: [cvr({ status: "IN_REVIEW", updatedAt: daysAgo(8) })],
          reviewerUserIds: [10],
        }),
      );
      expect(out[0].reminderType).toBe("CVR_IN_REVIEW_STALE");
    });

    it("does not fire under the 7-day threshold", () => {
      expect(
        selectReminders(
          input({
            cvrs: [cvr({ status: "IN_REVIEW", updatedAt: daysAgo(5) })],
            reviewerUserIds: [10],
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("FCO_REVIEW_STALE", () => {
    it("fires for SUBMITTED aged > 7 days", () => {
      const out = selectReminders(
        input({
          fcos: [fco({ status: "SUBMITTED", updatedAt: daysAgo(8) })],
          reviewerUserIds: [10],
        }),
      );
      expect(out[0].reminderType).toBe("FCO_REVIEW_STALE");
      expect(out[0].message).toMatch(/Submitted/i);
    });

    it("fires for IN_REVIEW aged > 7 days", () => {
      const out = selectReminders(
        input({
          fcos: [fco({ status: "IN_REVIEW", updatedAt: daysAgo(8) })],
          reviewerUserIds: [10],
        }),
      );
      expect(out[0].message).toMatch(/In review/i);
    });

    it("ignores DRAFT / APPROVED / CLOSED / VOID even if old", () => {
      expect(
        selectReminders(
          input({
            fcos: [
              fco({ status: "DRAFT", updatedAt: daysAgo(30) }),
              fco({ status: "APPROVED", updatedAt: daysAgo(30) }),
              fco({ status: "CLOSED", updatedAt: daysAgo(30) }),
            ],
            reviewerUserIds: [10],
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("FCO_WORK_STOPPED", () => {
    it("fires daily (no age gate) for open + work-stopped FCOs", () => {
      const out = selectReminders(
        input({
          fcos: [
            fco({
              status: "SUBMITTED",
              workStopped: true,
              updatedAt: daysAgo(0),
            }),
          ],
          adminUserIds: [99],
        }),
      );
      expect(out[0]).toMatchObject({
        reminderType: "FCO_WORK_STOPPED",
        recipientUserIds: [7, 99],
      });
    });

    it("does not fire for closed FCOs even if work-stopped flag is set", () => {
      expect(
        selectReminders(
          input({
            fcos: [
              fco({ status: "CLOSED", workStopped: true, updatedAt: daysAgo(1) }),
            ],
            adminUserIds: [99],
          }),
        ),
      ).toEqual([]);
    });

    it("fans out to admins only, not the full reviewer pool", () => {
      // updatedAt set to today so the review-stale rule doesn't co-fire on
      // the same record. That rule fans out to the full reviewer pool, and
      // we want to assert the work-stopped fan-out narrows to admins only.
      const out = selectReminders(
        input({
          fcos: [
            fco({
              status: "SUBMITTED",
              workStopped: true,
              createdById: null,
              updatedAt: daysAgo(0),
            }),
          ],
          reviewerUserIds: [10, 11, 99],
          adminUserIds: [99],
        }),
      );
      expect(out).toHaveLength(1);
      expect(out[0].reminderType).toBe("FCO_WORK_STOPPED");
      expect(out[0].recipientUserIds).toEqual([99]);
    });
  });

  describe("RFI_OPEN_PAST_DUE", () => {
    it("fires for OPEN with dueDate in the past", () => {
      const out = selectReminders(
        input({
          rfis: [rfi({ status: "OPEN", dueDate: daysAgo(2) })],
        }),
      );
      expect(out[0]).toMatchObject({
        reminderType: "RFI_OPEN_PAST_DUE",
        recipientUserIds: [7],
      });
    });

    it("does not fire when dueDate is in the future", () => {
      expect(
        selectReminders(
          input({
            rfis: [
              rfi({
                status: "OPEN",
                dueDate: new Date(
                  NOW.getTime() + 3 * 86_400_000,
                ).toISOString(),
              }),
            ],
          }),
        ),
      ).toEqual([]);
    });

    it("ignores non-OPEN statuses past their due date", () => {
      expect(
        selectReminders(
          input({
            rfis: [rfi({ status: "CLOSED", dueDate: daysAgo(10) })],
          }),
        ),
      ).toEqual([]);
    });

    it("does not fan out to reviewers — only the originator", () => {
      const out = selectReminders(
        input({
          rfis: [rfi({ status: "OPEN", dueDate: daysAgo(2) })],
          reviewerUserIds: [10, 11],
          adminUserIds: [99],
        }),
      );
      expect(out[0].recipientUserIds).toEqual([7]);
    });
  });

  describe("RFI_ANSWERED_STALE", () => {
    it("fires when ANSWERED and answeredAt > 3 days ago", () => {
      const out = selectReminders(
        input({
          rfis: [
            rfi({ status: "ANSWERED", answeredAt: daysAgo(4) }),
          ],
        }),
      );
      expect(out[0]).toMatchObject({
        reminderType: "RFI_ANSWERED_STALE",
        recipientUserIds: [7],
      });
    });

    it("does not fire under the 3-day threshold", () => {
      expect(
        selectReminders(
          input({
            rfis: [rfi({ status: "ANSWERED", answeredAt: daysAgo(1) })],
          }),
        ),
      ).toEqual([]);
    });

    it("does not fire when answeredAt is null (defensive)", () => {
      expect(
        selectReminders(
          input({
            rfis: [rfi({ status: "ANSWERED", answeredAt: null })],
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("output shape", () => {
    it("dedupes recipients across originator + reviewer pool", () => {
      // The originator is also a reviewer — they should appear once.
      const out = selectReminders(
        input({
          cvrs: [
            cvr({
              status: "PENDING_APPROVAL",
              updatedAt: daysAgo(5),
              createdById: 10,
            }),
          ],
          reviewerUserIds: [10, 11],
        }),
      );
      expect(out[0].recipientUserIds).toEqual([10, 11]);
    });

    it("returns recipients sorted ascending for stable downstream writes", () => {
      const out = selectReminders(
        input({
          cvrs: [
            cvr({
              status: "PENDING_APPROVAL",
              updatedAt: daysAgo(5),
              createdById: 7,
            }),
          ],
          reviewerUserIds: [11, 3, 22],
        }),
      );
      expect(out[0].recipientUserIds).toEqual([3, 7, 11, 22]);
    });
  });
});

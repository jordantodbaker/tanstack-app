import { describe, expect, it } from "vitest";
import {
  resolveNotificationRecipients,
  type NotificationRecipientsInput,
} from "./notification-recipients";

function input(
  overrides: Partial<NotificationRecipientsInput> = {},
): NotificationRecipientsInput {
  return {
    originatorId: 1,
    actorId: 99,
    needsReview: false,
    reviewerIds: [],
    ...overrides,
  };
}

describe("resolveNotificationRecipients", () => {
  describe("originator handling", () => {
    it("includes the originator when they are not the actor", () => {
      expect(
        resolveNotificationRecipients(
          input({ originatorId: 1, actorId: 99 }),
        ),
      ).toEqual([1]);
    });

    it("excludes the originator when they are the actor", () => {
      // Self-action: e.g. the originator clicks 'Submit for review' on
      // their own CVR. They shouldn't notify themselves of their own action.
      expect(
        resolveNotificationRecipients(
          input({ originatorId: 1, actorId: 1 }),
        ),
      ).toEqual([]);
    });

    it("ignores a null originatorId (record predates the column)", () => {
      expect(
        resolveNotificationRecipients(
          input({ originatorId: null, actorId: 99 }),
        ),
      ).toEqual([]);
    });
  });

  describe("reviewer fan-out", () => {
    it("includes reviewers when needsReview is true", () => {
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: null,
            actorId: 99,
            needsReview: true,
            reviewerIds: [2, 3, 4],
          }),
        ),
      ).toEqual([2, 3, 4]);
    });

    it("ignores reviewers when needsReview is false", () => {
      // Outcome-only transitions (APPROVED, EXECUTED, etc.) shouldn't
      // ping the reviewer pool — those notifications target the originator.
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: 1,
            actorId: 99,
            needsReview: false,
            reviewerIds: [2, 3, 4],
          }),
        ),
      ).toEqual([1]);
    });

    it("excludes the actor from the reviewer list", () => {
      // The approver who advances 'IN_REVIEW' shouldn't be re-notified
      // alongside the other approvers.
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: null,
            actorId: 3,
            needsReview: true,
            reviewerIds: [2, 3, 4],
          }),
        ),
      ).toEqual([2, 4]);
    });
  });

  describe("deduplication", () => {
    it("collapses originator and reviewer overlap to one recipient", () => {
      // Originator submits and is also a reviewer (e.g. an admin who
      // raised their own CVR). Should still only get one notification.
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: 2,
            actorId: 99,
            needsReview: true,
            reviewerIds: [2, 3, 4],
          }),
        ),
      ).toEqual([2, 3, 4]);
    });

    it("collapses duplicate reviewer ids", () => {
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: null,
            actorId: 99,
            needsReview: true,
            reviewerIds: [2, 2, 3, 3, 4],
          }),
        ),
      ).toEqual([2, 3, 4]);
    });
  });

  describe("output ordering", () => {
    it("returns recipients sorted ascending for stable downstream writes", () => {
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: 7,
            actorId: 99,
            needsReview: true,
            reviewerIds: [4, 2, 11],
          }),
        ),
      ).toEqual([2, 4, 7, 11]);
    });
  });

  describe("empty cases", () => {
    it("returns an empty array when only the actor would qualify", () => {
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: 5,
            actorId: 5,
            needsReview: true,
            reviewerIds: [5],
          }),
        ),
      ).toEqual([]);
    });

    it("returns an empty array when no inputs produce a recipient", () => {
      expect(
        resolveNotificationRecipients(
          input({
            originatorId: null,
            actorId: 99,
            needsReview: false,
            reviewerIds: [],
          }),
        ),
      ).toEqual([]);
    });
  });
});

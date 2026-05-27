/**
 * Pure recipient-resolution for workflow notifications. Lives in its own
 * module (not `notifications.server.ts`) so tests can import it without
 * pulling in Prisma or any server-only initialization.
 *
 * The rules — kept here as the single source of truth — are:
 *   - The originator always receives a notification (so they see the
 *     outcome of their submission), unless they're the actor.
 *   - When the destination state needs reviewer attention (`needsReview`),
 *     every reviewer also receives one, again excluding the actor.
 *   - Recipients are deduplicated, so an originator who is also a reviewer
 *     gets one notification, not two.
 *   - A `null` `originatorId` (record predates the column) is ignored.
 */

export type NotificationRecipientsInput = {
  /** User.id of whoever raised the record; null when unknown. */
  originatorId: number | null;
  /** User.id of whoever performed the transition. Always excluded. */
  actorId: number;
  /** True for transitions whose destination state should fan out to reviewers. */
  needsReview: boolean;
  /** Eligible reviewer User.ids (APPROVER/ADMIN with project access). */
  reviewerIds: number[];
};

/**
 * Returns the deduplicated list of User.ids that should receive a
 * notification for a workflow event. Order is sorted ascending so the
 * output is stable for tests and for the downstream `createMany` call.
 */
export function resolveNotificationRecipients(
  input: NotificationRecipientsInput,
): number[] {
  const recipients = new Set<number>();
  if (input.originatorId !== null) {
    recipients.add(input.originatorId);
  }
  if (input.needsReview) {
    for (const id of input.reviewerIds) recipients.add(id);
  }
  recipients.delete(input.actorId);
  return Array.from(recipients).sort((a, b) => a - b);
}

export type CommentRecipientsInput = {
  /** User.id of whoever raised the parent record; null when unknown. */
  originatorId: number | null;
  /** User.id of the person posting the new comment. Always excluded. */
  actorId: number;
  /** User.ids of everyone who has commented on this record previously. */
  priorAuthorIds: number[];
};

/**
 * Returns the deduplicated list of User.ids that should be notified about a
 * new comment. The rules:
 *   - The originator of the parent record always receives a notification,
 *     unless they're the actor.
 *   - Everyone who has commented on this record previously (the thread
 *     participants) also receives one, excluding the actor.
 *   - Output is sorted ascending so it's stable for tests and the
 *     downstream `createMany` call.
 */
export function resolveCommentRecipients(
  input: CommentRecipientsInput,
): number[] {
  const recipients = new Set<number>();
  if (input.originatorId !== null) {
    recipients.add(input.originatorId);
  }
  for (const id of input.priorAuthorIds) recipients.add(id);
  recipients.delete(input.actorId);
  return Array.from(recipients).sort((a, b) => a - b);
}

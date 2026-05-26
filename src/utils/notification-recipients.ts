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

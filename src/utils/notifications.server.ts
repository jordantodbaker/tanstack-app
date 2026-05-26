import type { PrismaClient } from "../generated/prisma/client";
import { prisma } from "../server/db";
import type { CurrentUser } from "./users";
import { resolveNotificationRecipients } from "./notification-recipients";

/**
 * SERVER-ONLY notification fan-out. Called from inside workflow-transition
 * transactions so the inbox rows commit atomically with the state change.
 *
 * The shape mirrors `audit.server.ts`: takes a `NotificationDb` satisfied by
 * either the top-level `prisma` client or a `$transaction` `tx`. Always pass
 * the `tx` from the mutation's transaction.
 */
type NotificationDb = Pick<PrismaClient, "notification" | "user">;

export type WorkflowEvent = {
  /** "ChangeLog" or "FieldChangeOrder" — matches AuditEvent.entityType. */
  entityType: string;
  entityId: number;
  projectId: number;
  /** Human-readable record name surfaced in the inbox (e.g. CVR-001). */
  title: string;
  /** Pre-rendered summary, e.g. "Status: In Review → Pending Approval". */
  message: string;
  /** User.id of whoever raised the record; null when unknown. Receives outcome notifications. */
  originatorId: number | null;
  /** User.id of whoever performed the transition. Always excluded from recipients. */
  actor: CurrentUser;
  /** True for transitions that move the record into a state needing reviewer/approver attention. */
  needsReview: boolean;
};

/**
 * Resolves recipients for a workflow event and inserts one notification row
 * per recipient. Recipients are:
 *   - the originator (so they see the outcome of their submission), and
 *   - every APPROVER or ADMINISTRATOR with project access, when the new state
 *     needs reviewer attention (e.g. IN_REVIEW, PENDING_APPROVAL, SUBMITTED).
 * The actor is always removed — no self-notifications.
 *
 * Failures are caught and logged. A notification miss is annoying; rolling
 * back a successful workflow transition because of one would be worse.
 * Audit events keep the strict "fail-the-transaction" contract because a
 * missing audit row is a data-integrity problem; notifications are not.
 */
export async function emitWorkflowNotification(
  db: NotificationDb,
  event: WorkflowEvent,
): Promise<void> {
  try {
    // Reviewer lookup is only worth doing when the destination state needs
    // attention — skip the round-trip for outcome-only transitions.
    // APPROVER must be assigned to the project; ADMINISTRATOR bypasses the
    // per-project ACL (matches `requireProjectAccess`).
    const reviewerIds = event.needsReview
      ? (
          await db.user.findMany({
            where: {
              OR: [
                { role: "ADMINISTRATOR" },
                {
                  role: "APPROVER",
                  projects: { some: { id: event.projectId } },
                },
              ],
            },
            select: { id: true },
          })
        ).map((u) => u.id)
      : [];

    const recipients = resolveNotificationRecipients({
      originatorId: event.originatorId,
      actorId: event.actor.id,
      needsReview: event.needsReview,
      reviewerIds,
    });
    if (recipients.length === 0) return;

    await db.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        projectId: event.projectId,
        entityType: event.entityType,
        entityId: event.entityId,
        title: event.title,
        message: event.message,
        actorEmail: event.actor.email,
      })),
    });
  } catch (err) {
    console.error("emitWorkflowNotification failed:", err);
  }
}

/**
 * Reads the signed-in user's inbox. Newest first. Limited to a small page
 * since the bell dropdown only shows recent items.
 */
export async function listNotifications(
  userId: number,
  limit = 50,
): Promise<
  {
    id: number;
    projectId: number | null;
    entityType: string;
    entityId: number;
    title: string;
    message: string;
    actorEmail: string;
    readAt: string | null;
    createdAt: string;
  }[]
> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    entityType: r.entityType,
    entityId: r.entityId,
    title: r.title,
    message: r.message,
    actorEmail: r.actorEmail,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function countUnread(userId: number): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markNotificationRead(
  userId: number,
  id: number,
): Promise<void> {
  // Scope by userId so a notification can only be touched by its owner.
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

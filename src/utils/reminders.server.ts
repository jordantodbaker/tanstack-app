import { prisma } from "../server/db";
import {
  type ChangeStatus,
  type ChangeLogItem,
  type ChangeType,
  type RiskLevel,
} from "./changelog";
import {
  type FcoItem,
  type FcoOriginType,
  type FcoPriority,
  type FcoStatus,
} from "./fcoLog";
import { type RfiItem, type RfiPriority, type RfiStatus } from "./rfis";
import { selectReminders, type RunRemindersResult } from "./reminders";

/**
 * SERVER-ONLY. Drives the daily time-based reminder cron.
 *
 *   - `runScheduledReminders` is a plain async function callable from the
 *     in-process cron (no auth context) and from the admin "Run now" button.
 *   - `runScheduledRemindersFn` is the admin-gated server-fn wrapper that
 *     the UI button calls; it bounces through `requireAdmin()` before
 *     invoking the plain function.
 *
 * Output of a run is a tiny summary `{ projectsScanned, remindersFired,
 * notificationsCreated }` — useful for the admin button's confirmation
 * toast and for logging.
 */

/** Notifications fired by the cron stamp this as the `actorEmail`. */
const SYSTEM_ACTOR_EMAIL = "system";

/** Dedup window for the reminder log lookup. Slightly under 24h so a cron
 *  that fires a few minutes early/late still picks up yesterday's pings. */
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

type ChangeLogRow = Awaited<
  ReturnType<typeof prisma.changeLog.findMany>
>[number];
type FcoScalarRow = Awaited<
  ReturnType<typeof prisma.fieldChangeOrder.findMany>
>[number];
type RfiScalarRow = Awaited<ReturnType<typeof prisma.rfi.findMany>>[number];

const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

// Mirrors the private `toItem` in `changelog.ts`. Duplicated here to keep the
// cron path independent of the (auth-gated) server-fn surface.
function toCvrItem(r: ChangeLogRow): ChangeLogItem {
  return {
    ...r,
    status: r.status as ChangeStatus,
    type: r.type as ChangeType,
    riskLevel: r.riskLevel as RiskLevel,
    requestedAt: r.requestedAt.toISOString(),
    dueDate: serializeDate(r.dueDate),
    approvedAt: serializeDate(r.approvedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// The cron doesn't need linked-CVR/RFI relations — selectReminders never
// reads them. We fill the nullable link fields with null so the result
// still satisfies `FcoItem`.
function toFcoItem(r: FcoScalarRow): FcoItem {
  return {
    ...r,
    status: r.status as FcoStatus,
    originType: r.originType as FcoOriginType,
    priority: r.priority as FcoPriority,
    initiatedAt: r.initiatedAt.toISOString(),
    neededBy: serializeDate(r.neededBy),
    closedAt: serializeDate(r.closedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    linkedCvrNumber: null,
    linkedCvrTitle: null,
    linkedRfiNumber: null,
    linkedRfiSubject: null,
  };
}

function toRfiItem(r: RfiScalarRow): RfiItem {
  return {
    ...r,
    status: r.status as RfiStatus,
    priority: r.priority as RfiPriority,
    dueDate: serializeDate(r.dueDate),
    initiatedAt: r.initiatedAt.toISOString(),
    answeredAt: serializeDate(r.answeredAt),
    closedAt: serializeDate(r.closedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    // selectReminders doesn't read linkedFcos — empty array satisfies the
    // type without paying the cost of the include.
    linkedFcos: [],
  };
}

/**
 * APPROVER + ADMINISTRATOR user ids with access to this project. ADMIN
 * bypasses the per-project ACL (matches `requireProjectAccess`); APPROVER
 * must be explicitly assigned.
 */
async function loadProjectReviewerIds(projectId: number): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { role: "ADMINISTRATOR" },
        { role: "APPROVER", projects: { some: { id: projectId } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function loadAdminUserIds(): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: { role: "ADMINISTRATOR" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function loadRecentReminderKeys(
  projectId: number,
  now: Date,
): Promise<Set<string>> {
  const since = new Date(now.getTime() - DEDUP_WINDOW_MS);
  const rows = await prisma.reminderLog.findMany({
    where: { projectId, sentAt: { gte: since } },
    select: { reminderType: true, entityId: true, recipientUserId: true },
  });
  return new Set(
    rows.map(
      (r) => `${r.reminderType}|${r.entityId}|${r.recipientUserId}`,
    ),
  );
}

/**
 * Plain async — invoked by the cron and by the admin "Run now" wrapper.
 * No auth check inside; callers gate appropriately. The server-fn shim
 * lives next door in `reminders.ts` so it's importable from the client.
 */
export async function runScheduledReminders(
  now: Date = new Date(),
): Promise<RunRemindersResult> {
  const projects = await prisma.project.findMany({ select: { id: true } });
  const adminUserIds = await loadAdminUserIds();
  let remindersFired = 0;
  let notificationsCreated = 0;

  for (const project of projects) {
    const [cvrRows, fcoRows, rfiRows, reviewerUserIds, recentReminders] =
      await Promise.all([
        prisma.changeLog.findMany({ where: { projectId: project.id } }),
        prisma.fieldChangeOrder.findMany({ where: { projectId: project.id } }),
        prisma.rfi.findMany({ where: { projectId: project.id } }),
        loadProjectReviewerIds(project.id),
        loadRecentReminderKeys(project.id, now),
      ]);

    const reminders = selectReminders({
      projectId: project.id,
      cvrs: cvrRows.map(toCvrItem),
      fcos: fcoRows.map(toFcoItem),
      rfis: rfiRows.map(toRfiItem),
      reviewerUserIds,
      adminUserIds,
      recentReminders,
      now,
    });
    if (reminders.length === 0) continue;

    // Single transaction per project so a partial failure rolls back the
    // notifications + log together. Failure for one project shouldn't kill
    // the whole run; the caller catches at the outer level.
    await prisma.$transaction(async (tx) => {
      for (const r of reminders) {
        await tx.notification.createMany({
          data: r.recipientUserIds.map((userId) => ({
            userId,
            projectId: r.projectId,
            entityType: r.entityType,
            entityId: r.entityId,
            title: r.title,
            message: r.message,
            actorEmail: SYSTEM_ACTOR_EMAIL,
          })),
        });
        await tx.reminderLog.createMany({
          data: r.recipientUserIds.map((userId) => ({
            reminderType: r.reminderType,
            entityType: r.entityType,
            entityId: r.entityId,
            projectId: r.projectId,
            recipientUserId: userId,
            sentAt: now,
          })),
        });
        notificationsCreated += r.recipientUserIds.length;
      }
    });
    remindersFired += reminders.length;
  }

  return {
    projectsScanned: projects.length,
    remindersFired,
    notificationsCreated,
  };
}


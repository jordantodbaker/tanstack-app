import { prisma } from "../server/db";
import { serializeDate } from "~/lib/serialize";
import { type ChangeStatus } from "./changelog";
import { FCO_OPEN_STATUSES, type FcoStatus } from "./fcoLog";
import { type RfiStatus } from "./rfis";
import {
  selectReminders,
  type RemindableCvr,
  type RemindableFco,
  type RemindableRfi,
  type RunRemindersResult,
} from "./reminders";

/**
 * SERVER-ONLY. Drives the daily time-based reminder cron.
 *
 *   - `runScheduledReminders` is a plain async function callable from the
 *     in-process cron (no auth context) and from the admin "Run now" button.
 *   - `runScheduledRemindersFn` is the admin-gated server-fn wrapper that
 *     the UI button calls; it bounces through `requireAdmin()` before
 *     invoking the plain function.
 *
 * Read shape: six parallel cross-project queries (projects, CVRs, FCOs,
 * RFIs, users, reminder log), each with a narrow `select` + a status
 * pre-filter that drops records the selector would never reminders on
 * anyway. Rows are then bucketed by projectId in JS. The previous shape
 * ran five queries **per project** in a serial outer loop and pulled
 * every column (including bulk text like `description` / `question` /
 * `response`), so on a 20-project tenant that was 100+ queries with
 * multi-MB payloads. Now it's six queries regardless of tenant size and
 * only the fields the selector actually reads.
 *
 * Write shape unchanged: one transaction per project (Notification +
 * ReminderLog createMany), so one project's failure doesn't kill the run.
 */

/** Notifications fired by the cron stamp this as the `actorEmail`. */
const SYSTEM_ACTOR_EMAIL = "system";

/** Dedup window for the reminder log lookup. Slightly under 24h so a cron
 *  that fires a few minutes early/late still picks up yesterday's pings. */
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

// ── Narrow SELECT shapes — kept in sync with the pure selector's reads ──

const CVR_REMINDER_SELECT = {
  id: true,
  projectId: true,
  status: true,
  updatedAt: true,
  createdById: true,
  cvrNumber: true,
  title: true,
} as const;

const FCO_REMINDER_SELECT = {
  id: true,
  projectId: true,
  status: true,
  updatedAt: true,
  createdById: true,
  fcoNumber: true,
  title: true,
  workStopped: true,
} as const;

const RFI_REMINDER_SELECT = {
  id: true,
  projectId: true,
  status: true,
  updatedAt: true,
  dueDate: true,
  createdById: true,
  rfiNumber: true,
  subject: true,
  answeredAt: true,
} as const;

// Prisma auto-narrows the row types based on the `select` above, but the
// datetime columns arrive as `Date`. The selector expects ISO strings
// (`updatedAt` in particular is compared via `daysBetween`), so a small
// mapper handles the serialization. `serializeDate` returns null for null
// inputs — matches the existing convention across `to*Item` mappers.

type CvrRow = Awaited<
  ReturnType<
    typeof prisma.changeLog.findMany<{ select: typeof CVR_REMINDER_SELECT }>
  >
>[number];
type FcoRow = Awaited<
  ReturnType<
    typeof prisma.fieldChangeOrder.findMany<{
      select: typeof FCO_REMINDER_SELECT;
    }>
  >
>[number];
type RfiRow = Awaited<
  ReturnType<
    typeof prisma.rfi.findMany<{ select: typeof RFI_REMINDER_SELECT }>
  >
>[number];

function toRemindableCvr(r: CvrRow): RemindableCvr {
  return {
    id: r.id,
    projectId: r.projectId,
    status: r.status as ChangeStatus,
    updatedAt: r.updatedAt.toISOString(),
    createdById: r.createdById,
    cvrNumber: r.cvrNumber,
    title: r.title,
  };
}

function toRemindableFco(r: FcoRow): RemindableFco {
  return {
    id: r.id,
    projectId: r.projectId,
    status: r.status as FcoStatus,
    updatedAt: r.updatedAt.toISOString(),
    createdById: r.createdById,
    fcoNumber: r.fcoNumber,
    title: r.title,
    workStopped: r.workStopped,
  };
}

function toRemindableRfi(r: RfiRow): RemindableRfi {
  return {
    id: r.id,
    projectId: r.projectId,
    status: r.status as RfiStatus,
    updatedAt: r.updatedAt.toISOString(),
    dueDate: serializeDate(r.dueDate),
    createdById: r.createdById,
    rfiNumber: r.rfiNumber,
    subject: r.subject,
    answeredAt: serializeDate(r.answeredAt),
  };
}

/** Groups a flat array by a keyed property into a `Map<key, T[]>`. */
function bucketBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const bucket = out.get(key);
    if (bucket) bucket.push(item);
    else out.set(key, [item]);
  }
  return out;
}

/**
 * Plain async — invoked by the cron and by the admin "Run now" wrapper.
 * No auth check inside; callers gate appropriately.
 */
export async function runScheduledReminders(
  now: Date = new Date(),
): Promise<RunRemindersResult> {
  const since = new Date(now.getTime() - DEDUP_WINDOW_MS);

  // Six parallel queries — one per data source, all cross-project. Status
  // pre-filters drop records the selector would never fire on anyway
  // (closed/rejected/void CVRs, closed FCOs, closed/void RFIs).
  const [projects, cvrRows, fcoRows, rfiRows, reviewerUsers, recentLog] =
    await Promise.all([
      prisma.project.findMany({ select: { id: true } }),
      prisma.changeLog.findMany({
        where: { status: { in: ["IN_REVIEW", "PENDING_APPROVAL"] } },
        select: CVR_REMINDER_SELECT,
      }),
      prisma.fieldChangeOrder.findMany({
        // FCO_OPEN_STATUSES covers both rules — status-based (SUBMITTED/
        // IN_REVIEW) and workStopped-based (any open status). The pure
        // selector re-checks the exact conditions per rule.
        where: { status: { in: FCO_OPEN_STATUSES } },
        select: FCO_REMINDER_SELECT,
      }),
      prisma.rfi.findMany({
        where: { status: { in: ["OPEN", "ANSWERED"] } },
        select: RFI_REMINDER_SELECT,
      }),
      // All admins + all approvers with their project assignments. We
      // resolve the per-project reviewer set in JS below rather than
      // running one user query per project.
      prisma.user.findMany({
        where: { role: { in: ["ADMINISTRATOR", "APPROVER"] } },
        select: {
          id: true,
          role: true,
          projects: { select: { id: true } },
        },
      }),
      // Reminder-log dedup: only rows within the past dedup window.
      prisma.reminderLog.findMany({
        where: { sentAt: { gte: since } },
        select: {
          reminderType: true,
          entityId: true,
          recipientUserId: true,
          projectId: true,
        },
      }),
    ]);

  const cvrsByProject = bucketBy(cvrRows.map(toRemindableCvr), (r) => r.projectId);
  const fcosByProject = bucketBy(fcoRows.map(toRemindableFco), (r) => r.projectId);
  const rfisByProject = bucketBy(rfiRows.map(toRemindableRfi), (r) => r.projectId);

  // Split users: admins (project-agnostic) + per-project approvers.
  const adminUserIds: number[] = [];
  const approversByProject = new Map<number, number[]>();
  for (const u of reviewerUsers) {
    if (u.role === "ADMINISTRATOR") {
      adminUserIds.push(u.id);
      continue;
    }
    // role === "APPROVER"
    for (const p of u.projects) {
      const bucket = approversByProject.get(p.id);
      if (bucket) bucket.push(u.id);
      else approversByProject.set(p.id, [u.id]);
    }
  }

  // Dedup log → Set<key> per project.
  const recentByProject = new Map<number, Set<string>>();
  for (const r of recentLog) {
    let set = recentByProject.get(r.projectId);
    if (!set) {
      set = new Set<string>();
      recentByProject.set(r.projectId, set);
    }
    set.add(`${r.reminderType}|${r.entityId}|${r.recipientUserId}`);
  }

  let remindersFired = 0;
  let notificationsCreated = 0;

  for (const project of projects) {
    const cvrs = cvrsByProject.get(project.id) ?? [];
    const fcos = fcosByProject.get(project.id) ?? [];
    const rfis = rfisByProject.get(project.id) ?? [];
    // Cheap short-circuit: no candidate records → no reminders can fire.
    // Skips the reviewer set-up + selector call for empty projects.
    if (cvrs.length === 0 && fcos.length === 0 && rfis.length === 0) continue;

    const reviewerUserIds = [
      ...adminUserIds,
      ...(approversByProject.get(project.id) ?? []),
    ];
    const recentReminders =
      recentByProject.get(project.id) ?? new Set<string>();

    const reminders = selectReminders({
      projectId: project.id,
      cvrs,
      fcos,
      rfis,
      reviewerUserIds,
      adminUserIds,
      recentReminders,
      now,
    });
    if (reminders.length === 0) continue;

    // Single transaction per project so a partial failure rolls back the
    // notifications + log together. Serial per-project loop preserves the
    // property that one project's failure doesn't kill the whole run.
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

import { createServerFn } from "@tanstack/react-start";
import type { ChangeLogItem } from "./changelog";
import type { FcoItem } from "./fcoLog";
import { FCO_OPEN_STATUSES } from "./fcoLog";
import type { RfiItem } from "./rfis";
import { isPast } from "./dashboard";
import { requireAdmin } from "./users.server";
import { runScheduledReminders } from "./reminders.server";

export type RunRemindersResult = {
  projectsScanned: number;
  remindersFired: number;
  notificationsCreated: number;
};

/**
 * Admin-gated wrapper for the daily reminder pass. Wired to the "Run
 * reminders now" button in Admin → System. Lives in `reminders.ts` (not
 * `reminders.server.ts`) to match the codebase's `createServerFn` housing
 * convention — the server-fn shim is the file that the client imports.
 *
 * No real input; `inputValidator` is still required because the rest of
 * the POST server fns in this codebase declare one. Call as
 * `runScheduledRemindersFn({ data: {} })`.
 */
export const runScheduledRemindersFn = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, never>) => input)
  .handler(async (): Promise<RunRemindersResult> => {
    await requireAdmin();
    return runScheduledReminders();
  });

/**
 * Pure selector for the daily time-based reminder cron. Given the current
 * state of a project (its CVRs / FCOs / RFIs) plus the dedup log of recent
 * reminders, returns the list of `Reminder`s the server should fire today.
 *
 * Kept in its own module so it's directly unit-testable without React,
 * Prisma, or the cron scheduler — same philosophy as `dashboard.ts`.
 *
 * Rules implemented (defaults — easy to tune later):
 *   - CVR_PENDING_APPROVAL_STALE   PENDING_APPROVAL aged > 3 days
 *   - CVR_IN_REVIEW_STALE          IN_REVIEW aged > 7 days
 *   - FCO_REVIEW_STALE             SUBMITTED or IN_REVIEW aged > 7 days
 *   - FCO_WORK_STOPPED             open + workStopped (daily nag, no age gate)
 *   - RFI_OPEN_PAST_DUE            OPEN with dueDate before today
 *   - RFI_ANSWERED_STALE           ANSWERED, answeredAt > 3 days ago
 *
 * Recipient policy:
 *   - All CVR / FCO rules: originator (when known) + every reviewer
 *     (APPROVER + ADMINISTRATOR with project access).
 *   - FCO work-stopped narrows reviewer fan-out to admins only — it's the
 *     urgent one, so the project's whole approver pool shouldn't be cc'd.
 *   - RFI rules: originator only. RFI workflow has no APPROVER role.
 *
 * `recentReminders` is the dedup set, keyed by
 * `"{reminderType}|{entityId}|{recipientUserId}"`. Recipients in that set
 * are filtered out; if the only candidates were duplicates, the whole
 * `Reminder` is omitted (no recipientless rows).
 */

export const CVR_PENDING_APPROVAL_STALE_DAYS = 3;
export const CVR_IN_REVIEW_STALE_DAYS = 7;
export const FCO_REVIEW_STALE_DAYS = 7;
export const RFI_ANSWERED_STALE_DAYS = 3;

export type ReminderType =
  | "CVR_PENDING_APPROVAL_STALE"
  | "CVR_IN_REVIEW_STALE"
  | "FCO_REVIEW_STALE"
  | "FCO_WORK_STOPPED"
  | "RFI_OPEN_PAST_DUE"
  | "RFI_ANSWERED_STALE";

export type ReminderEntityType = "ChangeLog" | "FieldChangeOrder" | "Rfi";

export type Reminder = {
  reminderType: ReminderType;
  entityType: ReminderEntityType;
  entityId: number;
  projectId: number;
  /** Deduped, sorted ascending, actor-free (no actor in the cron context). */
  recipientUserIds: number[];
  /** Notification title, e.g. "CVR-001 — Replace pump". */
  title: string;
  /** Notification body, e.g. "Pending approval for 5 days". */
  message: string;
};

export type SelectRemindersInput = {
  projectId: number;
  cvrs: ChangeLogItem[];
  fcos: FcoItem[];
  rfis: RfiItem[];
  /** User.ids of APPROVER + ADMINISTRATOR users with access to this project. */
  reviewerUserIds: number[];
  /** User.ids of ADMINISTRATOR users (project-agnostic; admins see all). */
  adminUserIds: number[];
  /** Dedup set keyed `${reminderType}|${entityId}|${recipientUserId}`. */
  recentReminders: Set<string>;
  now: Date;
};

/** "2026-05-25" → 2 days when now is 2026-05-27. */
function daysBetween(iso: string, now: Date): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function isOlderThanDays(iso: string, days: number, now: Date): boolean {
  return daysBetween(iso, now) >= days;
}

function dedupSort(ids: number[]): number[] {
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function buildRecipients(
  candidates: (number | null)[],
  reminderType: ReminderType,
  entityId: number,
  recentReminders: Set<string>,
): number[] {
  const valid = candidates.filter((id): id is number => id !== null);
  const deduped = dedupSort(valid);
  return deduped.filter(
    (id) => !recentReminders.has(`${reminderType}|${entityId}|${id}`),
  );
}

export function selectReminders(input: SelectRemindersInput): Reminder[] {
  const out: Reminder[] = [];

  for (const cvr of input.cvrs) {
    if (
      cvr.status === "PENDING_APPROVAL" &&
      isOlderThanDays(cvr.updatedAt, CVR_PENDING_APPROVAL_STALE_DAYS, input.now)
    ) {
      const recipients = buildRecipients(
        [cvr.createdById, ...input.reviewerUserIds],
        "CVR_PENDING_APPROVAL_STALE",
        cvr.id,
        input.recentReminders,
      );
      if (recipients.length > 0) {
        out.push({
          reminderType: "CVR_PENDING_APPROVAL_STALE",
          entityType: "ChangeLog",
          entityId: cvr.id,
          projectId: cvr.projectId,
          recipientUserIds: recipients,
          title: cvr.cvrNumber
            ? `${cvr.cvrNumber} — ${cvr.title}`
            : `CVR #${cvr.id} — ${cvr.title}`,
          message: `Pending approval for ${daysBetween(cvr.updatedAt, input.now)} days`,
        });
      }
    }

    if (
      cvr.status === "IN_REVIEW" &&
      isOlderThanDays(cvr.updatedAt, CVR_IN_REVIEW_STALE_DAYS, input.now)
    ) {
      const recipients = buildRecipients(
        [cvr.createdById, ...input.reviewerUserIds],
        "CVR_IN_REVIEW_STALE",
        cvr.id,
        input.recentReminders,
      );
      if (recipients.length > 0) {
        out.push({
          reminderType: "CVR_IN_REVIEW_STALE",
          entityType: "ChangeLog",
          entityId: cvr.id,
          projectId: cvr.projectId,
          recipientUserIds: recipients,
          title: cvr.cvrNumber
            ? `${cvr.cvrNumber} — ${cvr.title}`
            : `CVR #${cvr.id} — ${cvr.title}`,
          message: `In review for ${daysBetween(cvr.updatedAt, input.now)} days`,
        });
      }
    }
  }

  for (const fco of input.fcos) {
    if (
      (fco.status === "SUBMITTED" || fco.status === "IN_REVIEW") &&
      isOlderThanDays(fco.updatedAt, FCO_REVIEW_STALE_DAYS, input.now)
    ) {
      const recipients = buildRecipients(
        [fco.createdById, ...input.reviewerUserIds],
        "FCO_REVIEW_STALE",
        fco.id,
        input.recentReminders,
      );
      if (recipients.length > 0) {
        out.push({
          reminderType: "FCO_REVIEW_STALE",
          entityType: "FieldChangeOrder",
          entityId: fco.id,
          projectId: fco.projectId,
          recipientUserIds: recipients,
          title: fco.fcoNumber
            ? `${fco.fcoNumber} — ${fco.title}`
            : `FCO #${fco.id} — ${fco.title}`,
          message: `${fco.status === "SUBMITTED" ? "Submitted" : "In review"} for ${daysBetween(fco.updatedAt, input.now)} days`,
        });
      }
    }

    if (fco.workStopped && FCO_OPEN_STATUSES.includes(fco.status)) {
      // Urgent — narrows to admins (plus the originator) to avoid spraying
      // the whole approver pool every day on a single work-stopped record.
      const recipients = buildRecipients(
        [fco.createdById, ...input.adminUserIds],
        "FCO_WORK_STOPPED",
        fco.id,
        input.recentReminders,
      );
      if (recipients.length > 0) {
        out.push({
          reminderType: "FCO_WORK_STOPPED",
          entityType: "FieldChangeOrder",
          entityId: fco.id,
          projectId: fco.projectId,
          recipientUserIds: recipients,
          title: fco.fcoNumber
            ? `${fco.fcoNumber} — ${fco.title}`
            : `FCO #${fco.id} — ${fco.title}`,
          message: "Work stopped — field crew awaiting resolution",
        });
      }
    }
  }

  for (const rfi of input.rfis) {
    if (rfi.status === "OPEN" && isPast(rfi.dueDate, input.now)) {
      const recipients = buildRecipients(
        [rfi.createdById],
        "RFI_OPEN_PAST_DUE",
        rfi.id,
        input.recentReminders,
      );
      if (recipients.length > 0) {
        out.push({
          reminderType: "RFI_OPEN_PAST_DUE",
          entityType: "Rfi",
          entityId: rfi.id,
          projectId: rfi.projectId,
          recipientUserIds: recipients,
          title: rfi.rfiNumber
            ? `${rfi.rfiNumber} — ${rfi.subject}`
            : `RFI #${rfi.id} — ${rfi.subject}`,
          message: "Past due — no answer yet",
        });
      }
    }

    if (
      rfi.status === "ANSWERED" &&
      rfi.answeredAt !== null &&
      isOlderThanDays(rfi.answeredAt, RFI_ANSWERED_STALE_DAYS, input.now)
    ) {
      const recipients = buildRecipients(
        [rfi.createdById],
        "RFI_ANSWERED_STALE",
        rfi.id,
        input.recentReminders,
      );
      if (recipients.length > 0) {
        out.push({
          reminderType: "RFI_ANSWERED_STALE",
          entityType: "Rfi",
          entityId: rfi.id,
          projectId: rfi.projectId,
          recipientUserIds: recipients,
          title: rfi.rfiNumber
            ? `${rfi.rfiNumber} — ${rfi.subject}`
            : `RFI #${rfi.id} — ${rfi.subject}`,
          message: `Answered ${daysBetween(rfi.answeredAt, input.now)} days ago — confirm and close`,
        });
      }
    }
  }

  return out;
}

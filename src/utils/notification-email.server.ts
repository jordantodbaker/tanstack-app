import { prisma } from "../server/db";
import { appBaseUrl, isEmailConfigured, sendEmail } from "../server/email.server";
import { isEmailNotificationOptedIn } from "~/lib/email-pref";
import { entityListPath } from "~/lib/entity-routes";

/**
 * SERVER-ONLY email fan-out for notifications. Companion to
 * `notifications.server.ts`: that module writes the in-app inbox rows inside a
 * mutation's transaction; this module sends the matching email copies AFTER the
 * transaction commits.
 *
 * Why after-commit and awaited: on Vercel a function instance may be frozen as
 * soon as it returns its response, so fire-and-forget promises can be dropped
 * mid-flight. Callers therefore `await flushNotificationEmails(...)` once their
 * `prisma.$transaction(...)` has resolved. Sending after commit also means a
 * rolled-back transaction never emits a stray email.
 */

/** A batch of recipients to email about one notification event. Mirrors the
 *  fields written to `Notification` so the email reads the same as the inbox
 *  row. `recipientUserIds` are the in-app recipients the emit function already
 *  resolved (actor excluded, deduped). */
export type PendingNotificationEmail = {
  recipientUserIds: number[];
  projectId: number;
  entityType: string;
  entityId: number;
  title: string;
  message: string;
  /** Who triggered it ("system" for the reminder cron). Shown as context. */
  actorEmail: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail(
  e: PendingNotificationEmail,
): { subject: string; html: string; text: string } {
  const base = appBaseUrl();
  const path = entityListPath(e.entityType);
  const link = base && path ? `${base}${path}` : "";
  const by =
    e.actorEmail && e.actorEmail !== "system" ? ` by ${e.actorEmail}` : "";

  const subject = e.title;
  const text = [
    e.title,
    "",
    `${e.message}${by}`,
    ...(link ? ["", `Open in EPC Manager: ${link}`] : []),
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">`,
    `<p style="font-size:15px;font-weight:600;margin:0 0 4px">${escapeHtml(e.title)}</p>`,
    `<p style="font-size:14px;color:#334155;margin:0 0 12px">${escapeHtml(e.message)}${escapeHtml(by)}</p>`,
    link
      ? `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;font-size:13px">Open in EPC Manager</a></p>`
      : "",
    `<p style="font-size:11px;color:#94a3b8;margin:16px 0 0">You're receiving this because you're involved with this record in EPC Manager.</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}

/**
 * Send email copies for a set of pending notification events. No-op (with no
 * DB round-trip) when email isn't configured, so the default un-provisioned
 * environment pays nothing. Resolves recipient addresses + opt-out prefs in a
 * single query, then sends concurrently. Fail-soft: a send miss is logged
 * inside `sendEmail` and never propagates.
 */
export async function flushNotificationEmails(
  pending: PendingNotificationEmail[],
): Promise<void> {
  if (!isEmailConfigured() || pending.length === 0) return;
  try {
    const allIds = [
      ...new Set(pending.flatMap((p) => p.recipientUserIds)),
    ];
    if (allIds.length === 0) return;

    const users = await prisma.user.findMany({
      where: { id: { in: allIds } },
      select: { id: true, email: true, preference: { select: { prefs: true } } },
    });
    // id → email, only for users who haven't opted out and have an address.
    const emailById = new Map<number, string>();
    for (const u of users) {
      if (!u.email) continue;
      if (!isEmailNotificationOptedIn(u.preference?.prefs)) continue;
      emailById.set(u.id, u.email);
    }
    if (emailById.size === 0) return;

    const sends: Promise<unknown>[] = [];
    for (const p of pending) {
      const { subject, html, text } = renderEmail(p);
      const seen = new Set<string>();
      for (const userId of p.recipientUserIds) {
        const to = emailById.get(userId);
        // Dedup addresses within one event (a user can't match twice, but
        // guards against future fan-in).
        if (!to || seen.has(to)) continue;
        seen.add(to);
        sends.push(sendEmail({ to, subject, html, text }));
      }
    }
    await Promise.all(sends);
  } catch (err) {
    // Email is best-effort; never let a fan-out failure surface to the caller.
    console.error("flushNotificationEmails failed:", err);
  }
}

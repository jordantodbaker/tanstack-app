import cron from "node-cron";

/**
 * In-process daily cron for time-based reminders. Registers exactly once
 * per Node process via a `globalThis` guard, mirroring how `db.ts` caches
 * the PrismaClient — without it, HMR or duplicate imports would schedule
 * the job multiple times.
 *
 * Schedule: 07:00 every day in the server's local time zone (typical
 * "start of business"). Adjust `CRON_EXPRESSION` if your deployment needs
 * a different hour.
 *
 * Skipped entirely in non-production. Dev would otherwise fire reminders
 * against the demo seed data and spam your inbox.
 */

const CRON_EXPRESSION = "0 7 * * *";

type GlobalWithCron = typeof globalThis & {
  __reminderCronRegistered?: boolean;
};
const globalForCron = globalThis as GlobalWithCron;

function registerReminderCron(): void {
  if (globalForCron.__reminderCronRegistered) return;
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL) {
    // Dev: skip the schedule entirely. Admins can still kick it via the
    // "Run reminders now" button. Mark as registered so HMR reloads don't
    // re-check on every reload.
    //
    // Vercel: skip it too. The platform cron in `vercel.json` drives the
    // daily pass there, and a warm function instance would otherwise fire
    // this schedule alongside it — the ReminderLog dedup is a check then an
    // insert, not atomic, so two passes at once can send twice.
    globalForCron.__reminderCronRegistered = true;
    return;
  }
  cron.schedule(CRON_EXPRESSION, () => {
    // Loaded when the job fires, not when this module does: `db.ts` imports
    // this file, so a static import here would make every importer of
    // prisma load the whole reminder and notification graph with it.
    import("../utils/reminders.server")
      .then(({ runScheduledReminders }) => runScheduledReminders())
      .catch((err) => {
        // Swallow + log — a cron failure shouldn't crash the server process.
        // Admins can re-run via the UI button if needed.
        console.error("Scheduled reminders failed:", err);
      });
  });
  globalForCron.__reminderCronRegistered = true;
  console.log(
    `[cron] Reminder schedule registered ("${CRON_EXPRESSION}", local time).`,
  );
}

registerReminderCron();

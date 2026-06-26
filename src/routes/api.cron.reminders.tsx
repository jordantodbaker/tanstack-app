import { createFileRoute } from "@tanstack/react-router";
import { runRemindersCronFn } from "~/utils/reminders";

/**
 * HTTP entry point for the daily reminder cron. Vercel Cron (vercel.json
 * `crons`) GETs `/api/cron/reminders` on schedule; the catch-all rewrite in
 * vercel.json routes it through the SSR handler, so this route's `loader` runs
 * server-side — the one place the app's module graph (Prisma, `~` aliases) is
 * resolved. The loader delegates to the `CRON_SECRET`-guarded server fn, which
 * runs the reminder pass and (now) sends the email copies wired into it.
 *
 * The work happens in the loader, so it runs for the unauthenticated cron
 * request regardless of the client-side Clerk gate; a 2xx is all the scheduler
 * needs. The component only renders the result when a signed-in admin opens
 * the URL by hand.
 */
export const Route = createFileRoute("/api/cron/reminders")({
  loader: () => runRemindersCronFn({ data: {} }),
  component: CronReminderStatus,
});

function CronReminderStatus() {
  const result = Route.useLoaderData();
  return (
    <pre className="p-4 text-xs text-slate-700">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

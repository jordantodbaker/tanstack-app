import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, Play, BugPlay } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  runScheduledRemindersFn,
  type RunRemindersResult,
} from "~/utils/reminders";
import {
  getServerSentryStatus,
  triggerServerSentrySmoke,
  type SentryServerStatus,
} from "~/utils/sentry-smoke";
import { logger } from "~/lib/logger";

/**
 * Admin → System. Houses cross-cutting controls that don't belong under a
 * specific resource page. Today: a manual trigger for the daily reminder
 * cron — useful as a backup if the scheduler missed a run (server restart
 * during the scheduled window) and during dev/QA.
 */
export const Route = createFileRoute("/admin/system")({
  component: AdminSystemPage,
});

function AdminSystemPage() {
  const [lastResult, setLastResult] = React.useState<RunRemindersResult | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => runScheduledRemindersFn({ data: {} }),
    onSuccess: (result) => {
      setLastResult(result);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Run failed.");
    },
  });

  return (
    <main className="p-4 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System</h1>
        <p className="text-sm text-slate-500">
          Cross-cutting administrative actions.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <Bell className="size-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">
            Time-based reminders
          </h2>
        </div>
        <div className="p-4 space-y-3 text-sm text-slate-700">
          <p>
            A daily cron runs at 07:00 server-local and emits inbox
            notifications for stalled CVR approvals, in-review FCOs, open
            RFIs past due, and other time-driven signals.{" "}
            <span className="text-slate-500">
              Recipients are deduped — the same person doesn't get pinged
              about the same record more than once per day.
            </span>
          </p>
          <p className="text-slate-500">
            Use this button to fire the reminder pass on demand, e.g. if the
            server restarted during the scheduled window or during QA.
          </p>
          <div>
            <Button
              size="sm"
              onClick={() => run.mutate()}
              disabled={run.isPending}
            >
              <Play className="size-3.5 mr-1" />
              {run.isPending ? "Running…" : "Run reminders now"}
            </Button>
          </div>

          {lastResult && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              Scanned {lastResult.projectsScanned} project
              {lastResult.projectsScanned === 1 ? "" : "s"} ·{" "}
              {lastResult.remindersFired} reminder
              {lastResult.remindersFired === 1 ? "" : "s"} fired ·{" "}
              {lastResult.notificationsCreated} notification
              {lastResult.notificationsCreated === 1 ? "" : "s"} created.
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              {error}
            </div>
          )}
        </div>
      </div>

      <SentrySmokeTestCard />
    </main>
  );
}

/**
 * Two buttons that exercise each Sentry capture path independently so an
 * operator can confirm Sentry is wired up after a deploy or DSN change. Each
 * triggers exactly one event tagged "[sentry-smoke]" so they're easy to
 * find — and easy to discard — in the Sentry issue list. Safe to leave
 * permanently: the surface is admin-only and each click sends one event.
 *
 *   - Server-side path: `triggerServerSentrySmoke` throws inside the server
 *     fn handler; `sentryGlobalFunctionMiddleware` captures the throw. The
 *     mutation's onError is expected — the rejection is the point.
 *
 *   - Client-side path: `logger.error(...)` from the browser. Tests both
 *     the in-browser Sentry SDK init AND the `forwardErrorToSentry` wire we
 *     added to `logger.ts`.
 */
function SentrySmokeTestCard() {
  const [lastFired, setLastFired] = React.useState<"server" | "client" | null>(
    null,
  );
  const [serverStatus, setServerStatus] = React.useState<
    SentryServerStatus | null
  >(null);

  const serverSmoke = useMutation({
    mutationFn: () => triggerServerSentrySmoke({ data: {} }),
    // onError is expected — the server fn throws by design.
    onSettled: () => setLastFired("server"),
  });

  const checkStatus = useMutation({
    mutationFn: () => getServerSentryStatus(),
    onSuccess: (status) => setServerStatus(status),
  });

  function fireClientSmoke() {
    logger.error("[sentry-smoke] client-side log at " + new Date().toISOString(), {
      err: new Error(
        "[sentry-smoke] client-side throw — if you can see this in Sentry, " +
          "the browser SDK and logger.error → Sentry forwarder are wired up.",
      ),
    });
    setLastFired("client");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <BugPlay className="size-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">
          Sentry smoke test
        </h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p>
          Verify Sentry is shipping events end-to-end. Each button fires
          exactly one event tagged{" "}
          <span className="font-mono text-xs">[sentry-smoke]</span> — easy to
          find in the issue list and easy to discard.{" "}
          <span className="text-slate-500">
            No-op (event silently dropped) when no DSN is configured. The
            event should land in your Sentry dashboard within ~30 seconds.
          </span>
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkStatus.mutate()}
            disabled={checkStatus.isPending}
          >
            {checkStatus.isPending
              ? "Checking…"
              : "Check server Sentry status"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => serverSmoke.mutate()}
            disabled={serverSmoke.isPending}
          >
            {serverSmoke.isPending
              ? "Firing…"
              : "Throw server-side error"}
          </Button>
          <Button size="sm" variant="outline" onClick={fireClientSmoke}>
            Throw client-side error
          </Button>
        </div>

        {serverStatus && (
          <div
            className={`rounded border px-3 py-2 ${
              serverStatus.dsnEnvSet && serverStatus.clientEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-medium mb-1">Server Sentry status</div>
            <ul className="space-y-0.5 text-xs">
              <li>
                <span className="font-mono">SENTRY_DSN</span> env var set:{" "}
                <strong>{serverStatus.dsnEnvSet ? "yes" : "NO"}</strong>
                {serverStatus.dsnTail
                  ? ` (ends in ${serverStatus.dsnTail})`
                  : ""}
              </li>
              <li>
                <span className="font-mono">Sentry.init()</span> attached a
                client:{" "}
                <strong>
                  {serverStatus.clientInitialized ? "yes" : "NO"}
                </strong>
              </li>
              <li>
                Client <span className="font-mono">enabled</span> flag:{" "}
                <strong>{serverStatus.clientEnabled ? "yes" : "NO"}</strong>
              </li>
            </ul>
            {!serverStatus.dsnEnvSet && (
              <p className="mt-2 text-xs">
                <strong>Likely cause of missing server events:</strong>{" "}
                <span className="font-mono">SENTRY_DSN</span> isn't in the
                server runtime environment. Set it on the host (Vercel
                Environment Variables, or your local{" "}
                <span className="font-mono">.env</span>) and redeploy. The
                client side reads <span className="font-mono">VITE_SENTRY_DSN</span>{" "}
                — that's a separate variable baked into the bundle at build
                time, so it can work without the server DSN being set.
              </p>
            )}
          </div>
        )}

        {lastFired && (
          <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
            Fired a {lastFired}-side event. Check your Sentry dashboard for
            an issue starting with{" "}
            <span className="font-mono text-xs">[sentry-smoke]</span>.
          </div>
        )}
      </div>
    </div>
  );
}

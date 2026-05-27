import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  runScheduledRemindersFn,
  type RunRemindersResult,
} from "~/utils/reminders";

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
    </main>
  );
}

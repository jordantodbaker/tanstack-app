import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { visibleApps, type AppDef, type AppId } from "~/config/apps";
import { useIsAdmin } from "~/lib/use-current-user";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import { dashboardSummaryQueryOptions } from "~/utils/dashboardSummary";
import { latestPeriodWithEvmQueryOptions } from "~/utils/reporting";
import { allowedCbsL1CodesQueryOptions } from "~/utils/setup";
import { invalidByDisciplineQueryOptions } from "~/utils/projectTotals";
import { ProjectSelect } from "~/components/ProjectSelect";

export const Route = createLazyFileRoute("/")({ component: Launcher });

/**
 * The launcher — one card per app, each carrying a live figure for the selected
 * project so this is a status board rather than a menu.
 *
 * Every figure reuses a query one of the apps already runs (the dashboard
 * summary, the latest reporting period, the CBS allow-list, the invalid-row
 * count the estimate sidebar uses), so opening this page warms those caches
 * instead of adding round trips of its own. No project selected means no
 * figures — the cards still navigate.
 */

/** A figure for a card: the number plus what it counts. */
type Stat = { value: string; label: string; alert?: boolean } | null;

function Launcher() {
  const isAdmin = useIsAdmin();
  const apps = visibleApps(isAdmin);
  const { projectId } = useSelectedProject();
  const stats = useAppStats(projectId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Project Controls Platform
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Pick an area to work in. Each one has its own navigation; the switcher
          in the header moves between them.
        </p>
      </header>

      {projectId === null && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-amber-900">
            No project selected — choose one to see where things stand.
          </p>
          <ProjectSelect
            placeholder="Select project…"
            className="h-9 w-full sm:w-64"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} stat={stats[app.id]} />
        ))}
      </div>
    </div>
  );
}

function AppCard({ app, stat }: { app: AppDef; stat: Stat }) {
  const Icon = app.icon;
  return (
    <Link
      to={app.home}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon size={18} />
        </span>
        <h2 className="mt-1.5 flex-1 text-base font-bold text-slate-800">
          {app.label}
        </h2>
        <ArrowRight
          size={16}
          className="mt-2 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500"
        />
      </div>

      <p className="mt-3 flex-1 text-sm text-slate-500">{app.description}</p>

      {stat && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <span
            className={`font-bold ${stat.alert ? "text-amber-600" : "text-slate-800"}`}
          >
            {stat.value}
          </span>{" "}
          <span className="text-slate-500">{stat.label}</span>
        </p>
      )}
    </Link>
  );
}

/**
 * One figure per app, or null where there is nothing to say (no project
 * selected, or the query hasn't landed). Deliberately not a "loading" state:
 * a card is useful without its number, and a row of spinners is not.
 */
function useAppStats(projectId: number | null): Record<AppId, Stat> {
  const enabled = projectId !== null;
  const { versionId } = useSelectedVersion();

  const { data: summary } = useQuery({
    ...dashboardSummaryQueryOptions(projectId ?? 0),
    enabled,
  });
  const { data: period } = useQuery({
    ...latestPeriodWithEvmQueryOptions(projectId ?? 0),
    enabled,
  });
  const { data: allowedL1 } = useQuery({
    ...allowedCbsL1CodesQueryOptions(projectId ?? 0),
    enabled,
  });
  const { data: invalidByDiscipline } = useQuery(
    invalidByDisciplineQueryOptions(versionId),
  );

  return React.useMemo(() => {
    const invalid = Object.values(invalidByDiscipline ?? {}).reduce(
      (a, b) => a + b,
      0,
    );
    const open = (summary?.fco.open ?? 0) + (summary?.rfi.open ?? 0);
    const pending = summary?.attention.pendingApproval ?? 0;

    return {
      estimate: !enabled
        ? null
        : invalid > 0
          ? {
              value: String(invalid),
              label: `take-off row${invalid === 1 ? "" : "s"} need attention`,
              alert: true,
            }
          : { value: "No", label: "take-off rows need attention" },
      changes: !summary
        ? null
        : pending > 0
          ? {
              value: String(pending),
              label: `item${pending === 1 ? "" : "s"} awaiting approval`,
              alert: true,
            }
          : {
              value: String(open),
              label: `open FCO${open === 1 ? "" : "s"} and RFIs`,
            },
      cbs: !allowedL1
        ? null
        : {
            value: String(allowedL1.length),
            label: `cost code division${allowedL1.length === 1 ? "" : "s"} enabled`,
          },
      reports: !enabled
        ? null
        : period
          ? { value: period.label, label: "latest reporting period" }
          : { value: "No", label: "reporting periods yet" },
      admin: null,
    } satisfies Record<AppId, Stat>;
  }, [enabled, summary, period, allowedL1, invalidByDiscipline]);
}

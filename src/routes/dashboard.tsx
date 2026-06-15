import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ClipboardList,
  Hourglass,
  CircleDollarSign,
  CheckCircle2,
  CalendarDays,
  Clock,
  HardHat,
  AlertTriangle,
  CalendarClock,
  HelpCircle,
  Stamp,
} from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import {
  dashboardSummaryQueryOptions,
  EMPTY_DASHBOARD_SUMMARY as EMPTY_DASHBOARD,
} from "~/utils/dashboardSummary";
import { StatCard } from "~/components/ui/list-page";
import { StatusBadge, RiskBadge } from "~/components/Changelog/StatusBadge";
import { FcoStatusBadge } from "~/components/FCOLog/FcoBadges";
import { RfiStatusBadge } from "~/components/Rfi/RfiBadges";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";
import { disciplineById } from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { latestPeriodWithEvmQueryOptions } from "~/utils/reporting";
import { EvmDashboardCard } from "~/components/EvmDashboardCard";
import {
  userDashboardPrefsQueryOptions,
  type DashboardPrefs,
} from "~/utils/userPreferences";
import { DashboardCustomizeDialog } from "~/components/Dashboard/DashboardCustomizeDialog";
import {
  makeIsVisible,
  orderedWidgets,
  type DashboardWidgetId,
} from "~/config/dashboard-widgets";

export const Route = createFileRoute("/dashboard")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    // Prefs are user-scoped, not project-scoped — prefetch unconditionally so
    // the dashboard renders the right widget set on first paint even when
    // no project is selected.
    const prefetches: Promise<unknown>[] = [
      context.queryClient.ensureQueryData(userDashboardPrefsQueryOptions()),
    ];
    if (projectId !== null) {
      // Prefetch the aggregated summary (one round-trip; replaces the
      // prior three full-list prefetches).
      prefetches.push(
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            dashboardSummaryQueryOptions(projectId),
          ),
        ),
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            latestPeriodWithEvmQueryOptions(projectId),
          ),
        ),
      );
    }
    await Promise.all(prefetches);
  },
  component: DashboardPage,
});

const EMPTY_DASHBOARD_PREFS: DashboardPrefs = {
  hiddenWidgets: [],
  widgetOrder: [],
};

function DashboardPage() {
  const { projectId } = useSelectedProject();
  const { data: summary } = useQuery(dashboardSummaryQueryOptions(projectId));
  const { data: prefs = EMPTY_DASHBOARD_PREFS } = useQuery(
    userDashboardPrefsQueryOptions(),
  );
  const isVisible = React.useMemo(
    () => makeIsVisible(prefs.hiddenWidgets),
    [prefs.hiddenWidgets],
  );
  const orderedWidgetList = React.useMemo(
    () => orderedWidgets(prefs.widgetOrder),
    [prefs.widgetOrder],
  );
  const cvr = summary?.cvr ?? EMPTY_DASHBOARD.cvr;
  const fco = summary?.fco ?? EMPTY_DASHBOARD.fco;
  const rfi = summary?.rfi ?? EMPTY_DASHBOARD.rfi;
  const attention = summary?.attention ?? EMPTY_DASHBOARD.attention;

  // Per-widget renderers. The dashboard's render loop dispatches to these
  // by id, so changing the order is purely a matter of changing the
  // `orderedWidgetList` and rerunning the loop — no JSX is reorganized.
  // Adding a widget = catalog entry + a key in this map + drift-guard test
  // update; the test fails clearly if any of the three is missed.
  const renderers: Record<DashboardWidgetId, () => React.ReactNode> = {
    evm: () => (
      <Section title="Earned Value">
        <EvmDashboardCard />
      </Section>
    ),
    "cvr-stats": () => (
      <Section title="Change Log (CVRs)">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            label="Total CVRs"
            value={cvr.total.toString()}
            icon={ClipboardList}
          />
          <StatCard
            label="Open"
            value={cvr.open.toString()}
            tone="amber"
            icon={Hourglass}
          />
          <StatCard
            label="Net Cost Impact"
            value={`$${formatMoney(cvr.netCost)}`}
            tone={cvr.netCost < 0 ? "red" : "slate"}
            icon={CircleDollarSign}
          />
          <StatCard
            label="Approved Cost"
            value={`$${formatMoney(cvr.approvedCost)}`}
            tone="emerald"
            icon={CheckCircle2}
          />
          <StatCard
            label="Schedule Impact"
            value={`${cvr.scheduleDays} d`}
            tone="violet"
            icon={CalendarDays}
          />
          <StatCard
            label="Labor Impact"
            value={`${formatMoney(cvr.laborHours)} h`}
            tone="slate"
            icon={Clock}
          />
        </div>
      </Section>
    ),
    "fco-stats": () => (
      <Section title="FCO Log">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total FCOs"
            value={fco.total.toString()}
            icon={HardHat}
          />
          <StatCard
            label="Open"
            value={fco.open.toString()}
            tone="amber"
            icon={Hourglass}
          />
          <StatCard
            label="Est. Cost Impact"
            value={`$${formatMoney(fco.estCost)}`}
            tone={fco.estCost < 0 ? "red" : "slate"}
            icon={CircleDollarSign}
          />
          <StatCard
            label="Work Stopped"
            value={fco.workStopped.toString()}
            tone={fco.workStopped > 0 ? "red" : "slate"}
            icon={AlertTriangle}
          />
        </div>
      </Section>
    ),
    "rfi-stats": () => (
      <Section title="RFIs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Total RFIs"
            value={rfi.total.toString()}
            icon={HelpCircle}
          />
          <StatCard
            label="Open"
            value={rfi.open.toString()}
            tone="amber"
            icon={Hourglass}
          />
          <StatCard
            label="Awaiting close"
            value={rfi.awaitingClose.toString()}
            tone="violet"
          />
          <StatCard
            label="Past due"
            value={rfi.pastDue.toString()}
            tone={rfi.pastDue > 0 ? "red" : "slate"}
            icon={CalendarClock}
          />
          <StatCard
            label="Suspects impact"
            value={rfi.suspectsImpact.toString()}
            tone={rfi.suspectsImpact > 0 ? "red" : "slate"}
            icon={AlertTriangle}
          />
        </div>
      </Section>
    ),
    "needs-attention": () => (
      <Section title="Needs attention">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <AttentionItem
            icon={Stamp}
            count={attention.pendingApproval}
            label="CVRs pending approval"
            to="/changelog"
          />
          <AttentionItem
            icon={CalendarClock}
            count={attention.overdueCvr}
            label="CVRs past due date"
            to="/changelog"
          />
          <AttentionItem
            icon={CalendarClock}
            count={attention.overdueFco}
            label="FCOs past needed-by date"
            to="/fco-log"
          />
          <AttentionItem
            icon={AlertTriangle}
            count={attention.workStopped}
            label="Open FCOs with work stopped"
            to="/fco-log"
            urgent
          />
          <AttentionItem
            icon={HelpCircle}
            count={attention.rfiAwaitingClose}
            label="RFIs awaiting close"
            to="/rfis"
          />
          <AttentionItem
            icon={CalendarClock}
            count={attention.rfiPastDue}
            label="RFIs past due date"
            to="/rfis"
          />
        </div>
      </Section>
    ),
    "cvr-by-status": () => (
      <Panel title="CVRs by status">
        <BreakdownTable
          costLabel="Cost impact"
          rows={cvr.byStatus.map((r) => ({
            key: r.status,
            badge: <StatusBadge status={r.status} />,
            count: r.count,
            cost: r.cost,
          }))}
        />
      </Panel>
    ),
    "fco-by-status": () => (
      <Panel title="FCOs by status">
        <BreakdownTable
          costLabel="Est. cost"
          rows={fco.byStatus.map((r) => ({
            key: r.status,
            badge: <FcoStatusBadge status={r.status} />,
            count: r.count,
            cost: r.cost,
          }))}
        />
      </Panel>
    ),
    "rfi-by-status": () => (
      <Panel title="RFIs by status">
        {rfi.byStatus.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2">
            {rfi.byStatus.map((r) => (
              <li key={r.status} className="flex items-center justify-between">
                <RfiStatusBadge status={r.status} />
                <span className="tabular-nums text-sm text-slate-700">
                  {r.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),
    "cvr-by-risk": () => (
      <Panel title="CVRs by risk level">
        {cvr.byRisk.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2">
            {cvr.byRisk.map((r) => (
              <li key={r.level} className="flex items-center justify-between">
                <RiskBadge level={r.level} />
                <span className="tabular-nums text-sm text-slate-700">
                  {r.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),
    "cvr-by-discipline": () => (
      <Panel title="CVR cost impact by discipline">
        {cvr.byDiscipline.length === 0 ? (
          <EmptyNote />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {cvr.byDiscipline.map((d) => (
                <tr
                  key={d.discipline || "unassigned"}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="py-1.5 text-slate-700">
                    {d.discipline
                      ? (disciplineById[d.discipline]?.label ?? d.discipline)
                      : "Unassigned"}
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${
                      d.cost < 0 ? "text-red-600" : "text-slate-600"
                    }`}
                  >
                    {d.cost ? `$${formatMoney(d.cost)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    ),
  };

  return (
    <main className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="size-6 text-red-700" />
            Project Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Cost, schedule, and approval exposure across the current project.
          </p>
        </div>
        <DashboardCustomizeDialog currentPrefs={prefs} />
      </div>

      {projectId === null ? (
        <SelectProjectBanner>
          Select a project from the header to see the project dashboard.
        </SelectProjectBanner>
      ) : (
        <>
          {orderedWidgetList
            .filter((w) => isVisible(w.id))
            .map((w) => (
              <React.Fragment key={w.id}>{renderers[w.id]()}</React.Fragment>
            ))}
        </>
      )}
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyNote() {
  return <p className="text-sm text-slate-400">No records yet.</p>;
}

function BreakdownTable({
  rows,
  costLabel,
}: {
  rows: { key: string; badge: React.ReactNode; count: number; cost: number }[];
  costLabel: string;
}) {
  if (rows.length === 0) return <EmptyNote />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          <th className="pb-1.5 text-left font-semibold">Status</th>
          <th className="pb-1.5 text-right font-semibold">Count</th>
          <th className="pb-1.5 text-right font-semibold">{costLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-50">
            <td className="py-1.5">{r.badge}</td>
            <td className="py-1.5 text-right tabular-nums text-slate-700">
              {r.count}
            </td>
            <td
              className={`py-1.5 text-right tabular-nums ${
                r.cost < 0 ? "text-red-600" : "text-slate-500"
              }`}
            >
              {r.cost ? `$${formatMoney(r.cost)}` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AttentionItem({
  icon: Icon,
  count,
  label,
  to,
  urgent = false,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  to: "/changelog" | "/fco-log" | "/rfis";
  urgent?: boolean;
}) {
  const active = count > 0;
  const tone = !active
    ? {
        box: "border-slate-200 bg-slate-50 hover:bg-slate-100",
        icon: "text-slate-400",
        value: "text-slate-400",
      }
    : urgent
      ? {
          box: "border-red-200 bg-red-50 hover:bg-red-100",
          icon: "text-red-600",
          value: "text-red-700",
        }
      : {
          box: "border-amber-200 bg-amber-50 hover:bg-amber-100",
          icon: "text-amber-600",
          value: "text-amber-700",
        };
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${tone.box}`}
    >
      <Icon className={`size-5 shrink-0 ${tone.icon}`} />
      <div>
        <div className={`text-lg font-bold tabular-nums ${tone.value}`}>
          {count}
        </div>
        <div className="text-xs text-slate-600">{label}</div>
      </div>
    </Link>
  );
}

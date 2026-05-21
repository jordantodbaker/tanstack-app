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
  Stamp,
} from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { changeLogListQueryOptions } from "~/utils/changelog";
import { fcoListQueryOptions } from "~/utils/fcoLog";
import {
  summarizeCvrs,
  summarizeFcos,
  summarizeAttention,
} from "~/utils/dashboard";
import { StatCard } from "~/components/ui/list-page";
import { StatusBadge, RiskBadge } from "~/components/Changelog/StatusBadge";
import { FcoStatusBadge } from "~/components/FCOLog/FcoBadges";
import { disciplineById } from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";

export const Route = createFileRoute("/dashboard")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(
          changeLogListQueryOptions(projectId),
        ),
      );
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(fcoListQueryOptions(projectId)),
      );
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { projectId } = useSelectedProject();
  const { data: cvrs = [] } = useQuery(changeLogListQueryOptions(projectId));
  const { data: fcos = [] } = useQuery(fcoListQueryOptions(projectId));

  const cvr = React.useMemo(() => summarizeCvrs(cvrs), [cvrs]);
  const fco = React.useMemo(() => summarizeFcos(fcos), [fcos]);
  const attention = React.useMemo(
    () => summarizeAttention(cvrs, fcos),
    [cvrs, fcos],
  );

  return (
    <main className="p-4 max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <LayoutDashboard className="size-6 text-red-700" />
          Project Dashboard
        </h1>
        <p className="text-sm text-slate-500">
          Cost, schedule, and approval exposure across the current project.
        </p>
      </div>

      {projectId === null ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select a project from the header to see the project dashboard.
        </p>
      ) : (
        <>
          <Section title="Change Log (CVRs)">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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

          <Section title="Needs attention">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="CVRs by risk level">
              {cvr.byRisk.length === 0 ? (
                <EmptyNote />
              ) : (
                <ul className="space-y-2">
                  {cvr.byRisk.map((r) => (
                    <li
                      key={r.level}
                      className="flex items-center justify-between"
                    >
                      <RiskBadge level={r.level} />
                      <span className="tabular-nums text-sm text-slate-700">
                        {r.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
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
                            ? (disciplineById[d.discipline]?.label ??
                              d.discipline)
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
          </div>
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
  to: "/changelog" | "/fco-log";
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

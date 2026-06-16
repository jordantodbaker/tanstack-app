import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ListChecks,
  Plus,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import { useListFilters } from "~/lib/use-list-filters";
import {
  trendListQueryOptions,
  trendListFullQueryOptions,
  upsertTrend,
  deleteTrend,
  transitionTrend,
  promoteTrendToCvr,
  trendForecastContribution,
  invalidateTrendQueries,
  TREND_STATUSES,
  TREND_ACTIVE_STATUSES,
  type TrendItem,
  type TrendListItem,
  type TrendStatus,
  type UpsertTrendInput,
} from "~/utils/trends";
import { trendCsvColumns } from "~/utils/trendsCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { invalidateChangeLogQueries } from "~/utils/changelog";
import { TREND_STATUS_LABELS } from "~/utils/trendLabels";
import {
  TrendPriorityBadge,
  TrendStatusBadge,
} from "~/components/Trend/TrendBadges";
import { TrendDialog } from "~/components/Trend/TrendDialog";
import {
  FilterSelect,
  StatCard,
  TableEmptyState,
  Th,
} from "~/components/ui/list-page";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { disciplineById } from "~/config/disciplines";
import { formatAreaLabel } from "~/utils/areaLabels";
import { formatMoney } from "~/lib/formatting";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";

export const Route = createFileRoute("/trends")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(trendListQueryOptions(projectId)),
      );
    }
  },
  // `?q` lets the global search palette deep-link here with a record's number
  // pre-seeded into the page search box.
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s.q === "string" ? { q: s.q } : {},
  component: TrendLogPage,
});

function isPast(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(iso) < startOfToday;
}

function TrendLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(trendListQueryOptions(projectId));
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(projectId),
  );

  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  // Trend promotion creates a CVR. The CVR fan-out (dashboard + cvrOptions)
  // is owned by `invalidateChangeLogQueries`; trend's own fan-out covers the
  // EVM reporting caches that fold trend forecast into their roll-ups.
  // (This call previously used `["changelog", …]` lowercase, which never
  // matched the actual `["changeLog", …]` key — so the CVR list silently
  // failed to refresh after a Trend → CVR promotion.)
  const invalidate = () => {
    invalidateTrendQueries(queryClient, projectId);
    invalidateChangeLogQueries(queryClient, projectId);
  };

  const upsert = useMutation({
    mutationFn: (input: UpsertTrendInput) => upsertTrend({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteTrend({ data: { id } }),
    onSuccess: invalidate,
  });
  const transition = useMutation({
    mutationFn: (input: { id: number; action: string }) =>
      transitionTrend({ data: input }),
    onSuccess: invalidate,
  });
  const promote = useMutation({
    mutationFn: (trendId: number) =>
      promoteTrendToCvr({ data: { trendId } }),
    onSuccess: invalidate,
  });

  const { q } = Route.useSearch();
  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    disciplineFilter,
    setDisciplineFilter,
  } = useListFilters<TrendStatus>(q);

  // Slim list payload drops `description` / `reasonNarrative` / `notes`;
  // search by trend #, title, initiator, and area covers the common cases.
  const matchesFilters = React.useCallback(
    (it: TrendListItem): boolean => {
      const q = search.trim().toLowerCase();
      if (statusFilter && it.status !== statusFilter) return false;
      if (disciplineFilter && it.discipline !== disciplineFilter) return false;
      if (q) {
        const haystack =
          `${it.trendNumber} ${it.title} ${it.initiatedBy} ${areaLabel(it.locationArea)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    },
    [search, statusFilter, disciplineFilter, areaLabel],
  );

  const filtered = React.useMemo(
    () => items.filter(matchesFilters),
    [items, matchesFilters],
  );

  const stats = React.useMemo(() => {
    const now = new Date();
    const active = items.filter((i) =>
      TREND_ACTIVE_STATUSES.includes(i.status),
    );
    const activeCount = active.length;
    const pastDue = active.filter((i) => isPast(i.neededBy, now)).length;
    // Total AFC contribution (probability-weighted) across active trends.
    // Matches the per-bucket roll-up on the reporting page.
    const totalForecast = active.reduce(
      (sum, t) =>
        sum +
        trendForecastContribution({
          status: t.status,
          probability: t.probability,
          costLikely: t.costLikely,
        }),
      0,
    );
    // Unweighted likely exposure across active trends — what AFC becomes if
    // every active trend lands at full value. Surfaces "worst-case" risk.
    const totalExposure = active.reduce((sum, t) => sum + t.costLikely, 0);
    const probableCount = items.filter((i) => i.status === "PROBABLE").length;
    return {
      activeCount,
      pastDue,
      totalForecast,
      totalExposure,
      probableCount,
    };
  }, [items]);

  const projectScoped = projectId !== null;

  function handleSubmit(input: Omit<UpsertTrendInput, "projectId">) {
    if (!projectScoped) return Promise.resolve();
    return upsert.mutateAsync({ ...input, projectId });
  }

  function handleDelete(id: number) {
    return remove.mutateAsync(id);
  }

  function handleTransition(input: { id: number; action: string }) {
    return transition.mutateAsync(input);
  }

  function handlePromote(id: number) {
    return promote.mutateAsync(id);
  }

  return (
    <main className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="size-6 text-amber-600" />
            Trend Log
          </h1>
          <p className="text-sm text-slate-500">
            Anticipated cost impacts that aren't authorized CVRs yet. Active
            trends drive the project's AFC at{" "}
            <span className="font-mono">probability × likely cost</span>.
          </p>
        </div>
        <TrendDialog
          projectId={projectId}
          trigger={
            <Button disabled={!projectScoped}>
              <Plus className="mr-1 size-4" />
              New Trend
            </Button>
          }
          onSubmit={handleSubmit}
        />
      </div>

      {!projectScoped && (
        <SelectProjectBanner>
          Select a project from the header to start logging trends.
        </SelectProjectBanner>
      )}

      <TrendStatsCards
        total={items.length}
        activeCount={stats.activeCount}
        probableCount={stats.probableCount}
        pastDue={stats.pastDue}
        totalForecast={stats.totalForecast}
        totalExposure={stats.totalExposure}
      />

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trend #, title, description, narrative…"
            className="pl-7 w-full sm:w-80"
          />
        </div>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as TrendStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            ...TREND_STATUSES.map((s) => ({
              value: s,
              label: TREND_STATUS_LABELS[s],
            })),
          ]}
        />
        <FilterSelect
          label="Discipline"
          value={disciplineFilter}
          onChange={setDisciplineFilter}
          options={[
            { value: "", label: "All disciplines" },
            ...Object.values(disciplineById)
              .filter((d) => d.l1Codes && d.l1Codes.length > 0)
              .map((d) => ({ value: d.id, label: d.label })),
          ]}
        />
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <span className="text-xs text-slate-500">
            Showing {filtered.length} of {items.length}
          </span>
          <ExportCsvButton
            getItems={async () => {
              const full = await queryClient.fetchQuery(
                trendListFullQueryOptions(projectId),
              );
              return full.filter(matchesFilters);
            }}
            disabled={filtered.length === 0}
            columns={trendCsvColumns(areaLabel)}
            filenamePrefix="trend-export"
          />
        </div>
      </div>

      <TrendTable
        items={filtered}
        projectId={projectId}
        areaLabel={areaLabel}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onTransition={handleTransition}
        onPromote={handlePromote}
      />
    </main>
  );
}

function TrendStatsCards({
  total,
  activeCount,
  probableCount,
  pastDue,
  totalForecast,
  totalExposure,
}: {
  total: number;
  activeCount: number;
  probableCount: number;
  pastDue: number;
  totalForecast: number;
  totalExposure: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <StatCard
        label="Total trends"
        value={total.toString()}
        icon={ListChecks}
      />
      <StatCard
        label="Active"
        value={activeCount.toString()}
        tone="amber"
        icon={TrendingUp}
      />
      <StatCard label="Probable" value={probableCount.toString()} tone="violet" />
      <StatCard
        label="Past needed-by"
        value={pastDue.toString()}
        tone={pastDue > 0 ? "red" : "slate"}
        icon={CalendarClock}
      />
      <StatCard
        label="Weighted AFC"
        value={formatMoney(totalForecast)}
        tone="amber"
        icon={Wallet}
      />
      <StatCard
        label="Likely exposure"
        value={formatMoney(totalExposure)}
        tone={totalExposure > 0 ? "red" : "slate"}
        icon={AlertTriangle}
      />
    </div>
  );
}

function TrendTable({
  items,
  projectId,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
}: {
  items: TrendListItem[];
  projectId: number | null;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertTrendInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  onPromote: (id: number) => Promise<unknown>;
}) {
  if (items.length === 0) {
    return <TableEmptyState message="No trends match the current filters." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>Trend #</Th>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th>Discipline</Th>
            <Th>Area</Th>
            <Th className="text-right">Prob.</Th>
            <Th className="text-right">Likely</Th>
            <Th className="text-right">AFC contrib.</Th>
            <Th>Needed by</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <TrendRow
              key={item.id}
              item={item}
              projectId={projectId}
              areaLabel={areaLabel}
              onSubmit={onSubmit}
              onDelete={onDelete}
              onTransition={onTransition}
              onPromote={onPromote}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendRow({
  item,
  projectId,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
}: {
  item: TrendListItem;
  projectId: number | null;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertTrendInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  onPromote: (id: number) => Promise<unknown>;
}) {
  const disciplineLabel = item.discipline
    ? (disciplineById[item.discipline]?.label ?? item.discipline)
    : "—";
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const contribution = trendForecastContribution({
    status: item.status,
    probability: item.probability,
    costLikely: item.costLikely,
  });
  return (
    <TrendDialog
      projectId={projectId}
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {item.trendNumber || `#${item.id}`}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            <div>{item.title}</div>
            {item.linkedCvrId && (
              <div className="text-xs text-emerald-700 mt-0.5">
                → CVR #{item.linkedCvrId}
              </div>
            )}
          </td>
          <td className={cellCls}>
            <TrendStatusBadge status={item.status} />
          </td>
          <td className={cellCls}>
            <TrendPriorityBadge priority={item.priority} />
          </td>
          <td className={`${cellCls} text-slate-700`}>{disciplineLabel}</td>
          <td className={`${cellCls} text-slate-700`}>
            {item.locationArea ? areaLabel(item.locationArea) : "—"}
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {Math.round(item.probability * 100)}%
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {formatMoney(item.costLikely)}
          </td>
          <td
            className={`${cellCls} text-right tabular-nums font-medium ${contribution > 0 ? "text-amber-800" : "text-slate-400"}`}
          >
            {formatMoney(contribution)}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            {item.neededBy
              ? new Date(item.neededBy).toLocaleDateString()
              : "—"}
          </td>
        </tr>
      }
      initial={item}
      onSubmit={onSubmit}
      onDelete={onDelete}
      onTransition={onTransition}
      onPromote={onPromote}
    />
  );
}

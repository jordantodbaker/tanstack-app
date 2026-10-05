import { createLazyFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ListChecks,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSelectedProject } from "~/lib/selected-project";
import { computeTrendStats } from "~/lib/list-stats";
import { makeFilteredExport } from "~/lib/filtered-export";
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
  useListPage,
  ListPageLayout,
  ListTable,
  BulkActionBar,
  type ListColumn,
} from "~/components/ui/list-view";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { disciplineById } from "~/config/disciplines";
import { formatAreaLabel } from "~/utils/areaLabels";
import { formatMoney } from "~/lib/formatting";
import { TREND_TRANSITIONS } from "~/utils/workflow";

export const Route = createLazyFileRoute("/trends")({
  component: TrendLogPage,
});

function TrendLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(trendListQueryOptions(projectId));
  const { data: areas = [] } = useQuery(areasByProjectQueryOptions(projectId));

  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  // Trend promotion creates a CVR. The CVR fan-out (dashboard + cvrOptions)
  // is owned by `invalidateChangeLogQueries`; trend's own fan-out covers the
  // EVM reporting caches that fold trend forecast into their roll-ups.
  const invalidate = React.useCallback(() => {
    invalidateTrendQueries(queryClient, projectId);
    invalidateChangeLogQueries(queryClient, projectId);
  }, [queryClient, projectId]);

  // Slim list payload drops `description` / `reasonNarrative` / `notes`;
  // search by trend #, title, initiator, and area covers the common cases.
  const accessors = React.useMemo(
    () => ({
      discipline: (i: TrendListItem) => i.discipline,
      haystack: (i: TrendListItem) =>
        `${i.trendNumber} ${i.title} ${i.initiatedBy} ${areaLabel(i.locationArea)}`,
    }),
    [areaLabel],
  );

  const list = useListPage<TrendListItem, TrendStatus, UpsertTrendInput>({
    items,
    projectId,
    searchQ: Route.useSearch().q,
    upsertFn: upsertTrend,
    deleteFn: deleteTrend,
    transitionFn: transitionTrend,
    promoteFn: (id) => promoteTrendToCvr({ data: { trendId: id } }),
    invalidate,
    transitions: TREND_TRANSITIONS,
    entityNoun: "trend",
    accessors,
  });

  const stats = React.useMemo(
    () => computeTrendStats(items, new Date()),
    [items],
  );

  const columns: ListColumn<TrendListItem>[] = [
    {
      header: "Trend #",
      cellClassName: "align-top font-mono text-xs text-slate-700",
      cell: (item) => item.trendNumber || `#${item.id}`,
    },
    {
      header: "Title",
      cellClassName: "align-top font-medium text-slate-800",
      cell: (item) => (
        <>
          <div>{item.title}</div>
          {item.linkedCvrId && (
            <div className="text-xs text-emerald-700 mt-0.5">
              → CVR #{item.linkedCvrId}
            </div>
          )}
        </>
      ),
    },
    {
      header: "Status",
      cellClassName: "align-top",
      cell: (item) => <TrendStatusBadge status={item.status} />,
    },
    {
      header: "Priority",
      cellClassName: "align-top",
      cell: (item) => <TrendPriorityBadge priority={item.priority} />,
    },
    {
      header: "Discipline",
      cellClassName: "align-top text-slate-700",
      cell: (item) =>
        item.discipline
          ? (disciplineById[item.discipline]?.label ?? item.discipline)
          : "—",
    },
    {
      header: "Area",
      cellClassName: "align-top text-slate-700",
      cell: (item) =>
        item.locationArea ? areaLabel(item.locationArea) : "—",
    },
    {
      header: "Prob.",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums text-slate-700",
      cell: (item) => `${Math.round(item.probability * 100)}%`,
    },
    {
      header: "Likely",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums text-slate-700",
      cell: (item) => formatMoney(item.costLikely),
    },
    {
      header: "AFC contrib.",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums font-medium",
      cell: (item) => {
        const contribution = trendForecastContribution({
          status: item.status,
          probability: item.probability,
          costLikely: item.costLikely,
        });
        return (
          <span className={contribution > 0 ? "text-amber-800" : "text-slate-400"}>
            {formatMoney(contribution)}
          </span>
        );
      },
    },
    {
      header: "Needed by",
      cellClassName: "align-top text-xs text-slate-500",
      cell: (item) =>
        item.neededBy ? new Date(item.neededBy).toLocaleDateString() : "—",
    },
  ];

  return (
    <ListPageLayout
      icon={TrendingUp}
      iconClassName="text-amber-600"
      title="Trend Log"
      description={
        <>
          Anticipated cost impacts that aren't authorized CVRs yet. Active
          trends drive the project's AFC at{" "}
          <span className="font-mono">probability × likely cost</span>.
        </>
      }
      newAction={
        <TrendDialog
          projectId={projectId}
          trigger={
            <Button disabled={!list.projectScoped}>
              <Plus className="mr-1 size-4" />
              New Trend
            </Button>
          }
          onSubmit={list.handleSubmit}
        />
      }
      projectScoped={list.projectScoped}
      bannerText="Select a project from the header to start logging trends."
      cards={[
        {
          label: "Total trends",
          value: items.length.toString(),
          icon: ListChecks,
        },
        {
          label: "Active",
          value: stats.activeCount.toString(),
          tone: "amber",
          icon: TrendingUp,
        },
        {
          label: "Probable",
          value: stats.probableCount.toString(),
          tone: "violet",
        },
        {
          label: "Past needed-by",
          value: stats.pastDue.toString(),
          tone: stats.pastDue > 0 ? "red" : "slate",
          icon: CalendarClock,
        },
        {
          label: "Weighted AFC",
          value: formatMoney(stats.totalForecast),
          tone: "amber",
          icon: Wallet,
        },
        {
          label: "Likely exposure",
          value: formatMoney(stats.totalExposure),
          tone: stats.totalExposure > 0 ? "red" : "slate",
          icon: AlertTriangle,
        },
      ]}
      search={list.filters.search}
      setSearch={list.filters.setSearch}
      searchPlaceholder="Search trend #, title, description, narrative…"
      statusFilter={list.filters.statusFilter}
      setStatusFilter={(v) => list.filters.setStatusFilter(v as TrendStatus | "")}
      statusOptions={[
        { value: "", label: "All statuses" },
        ...TREND_STATUSES.map((s) => ({
          value: s,
          label: TREND_STATUS_LABELS[s],
        })),
      ]}
      disciplineFilter={list.filters.disciplineFilter}
      setDisciplineFilter={list.filters.setDisciplineFilter}
      filteredCount={list.filtered.length}
      totalCount={items.length}
      exportButton={
        <ExportCsvButton
          getItems={makeFilteredExport(
            queryClient,
            trendListFullQueryOptions(projectId),
            list.matchesFilters,
          )}
          disabled={list.filtered.length === 0}
          columns={trendCsvColumns(areaLabel)}
          filenamePrefix="trend-export"
        />
      }
      bulkBar={<BulkActionBar {...list.bulk.bar} />}
    >
      <ListTable
        items={list.filtered}
        columns={columns}
        emptyMessage="No trends match the current filters."
        bulk={list.bulk.table}
        renderRowDialog={(item, trigger) => (
          <TrendDialog
            projectId={projectId}
            trigger={trigger}
            initial={item}
            onSubmit={list.handleSubmit}
            onDelete={list.handleDelete}
            onTransition={list.handleTransition}
            onPromote={list.handlePromote}
          />
        )}
      />
    </ListPageLayout>
  );
}

import { createLazyFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSelectedProject } from "~/lib/selected-project";
import { computeCvrStats } from "~/lib/list-stats";
import { makeFilteredExport } from "~/lib/filtered-export";
import {
  changeLogListQueryOptions,
  changeLogListFullQueryOptions,
  upsertChangeLog,
  deleteChangeLog,
  transitionChangeLog,
  invalidateChangeLogQueries,
  CHANGE_STATUSES,
  type ChangeLogListItem,
  type ChangeStatus,
  type UpsertChangeLogInput,
} from "~/utils/changelog";
import {
  RiskBadge,
  StatusBadge,
  STATUS_LABELS,
  TYPE_LABELS,
} from "~/components/Changelog/StatusBadge";
import { ChangelogDialog } from "~/components/Changelog/ChangelogDialog";
import {
  useListPage,
  ListPageLayout,
  ListTable,
  BulkActionBar,
  type ListColumn,
} from "~/components/ui/list-view";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { disciplineById } from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";
import { cvrCsvColumns } from "~/utils/changelogCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { formatAreaLabel } from "~/utils/areaLabels";
import { CVR_TRANSITIONS } from "~/utils/workflow";

export const Route = createLazyFileRoute("/changelog")({
  component: ChangelogPage,
});

function ChangelogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(changeLogListQueryOptions(projectId));
  // CVRs hold an Area.id as a string; resolve to "displayId — name" for the
  // table and the search haystack. Empty `area` means project-wide (no link).
  const { data: areas = [] } = useQuery(areasByProjectQueryOptions(projectId));
  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  const invalidate = React.useCallback(
    () => invalidateChangeLogQueries(queryClient, projectId),
    [queryClient, projectId],
  );

  const accessors = React.useMemo(
    () => ({
      discipline: (i: ChangeLogListItem) => i.discipline,
      haystack: (i: ChangeLogListItem) =>
        `${i.cvrNumber} ${i.title} ${i.originator} ${i.approver} ${i.cbsCodes.join(" ")} ${areaLabel(i.area)}`,
    }),
    [areaLabel],
  );

  const list = useListPage<ChangeLogListItem, ChangeStatus, UpsertChangeLogInput>(
    {
      items,
      projectId,
      searchQ: Route.useSearch().q,
      upsertFn: upsertChangeLog,
      deleteFn: deleteChangeLog,
      transitionFn: transitionChangeLog,
      invalidate,
      transitions: CVR_TRANSITIONS,
      entityNoun: "CVR",
      accessors,
    },
  );

  const stats = React.useMemo(() => computeCvrStats(items), [items]);

  const columns: ListColumn<ChangeLogListItem>[] = [
    {
      header: "CVR",
      cellClassName: "font-mono text-xs text-slate-700",
      cell: (item) => item.cvrNumber || "—",
    },
    {
      header: "Title",
      cellClassName: "font-medium text-slate-800",
      cell: (item) => (
        <>
          {item.title}
          {item.cbsCodes.length > 0 && (
            <div className="mt-0.5 text-xs text-slate-400 font-mono truncate max-w-md">
              {item.cbsCodes.slice(0, 3).join(", ")}
              {item.cbsCodes.length > 3 && ` +${item.cbsCodes.length - 3}`}
            </div>
          )}
        </>
      ),
    },
    {
      header: "Status",
      cell: (item) => <StatusBadge status={item.status} />,
    },
    {
      header: "Type",
      cellClassName: "text-slate-700",
      cell: (item) => TYPE_LABELS[item.type],
    },
    {
      header: "Discipline",
      cellClassName: "text-slate-700",
      cell: (item) =>
        item.discipline
          ? (disciplineById[item.discipline]?.label ?? item.discipline)
          : "—",
    },
    {
      header: "Area",
      cellClassName: "text-slate-700",
      cell: (item) => (item.area ? areaLabel(item.area) : "—"),
    },
    {
      header: "Risk",
      cell: (item) => <RiskBadge level={item.riskLevel} />,
    },
    {
      header: "Cost $",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (item) => (
        <span className={item.costImpact < 0 ? "text-red-600" : "text-slate-700"}>
          {item.costImpact ? `$${formatMoney(item.costImpact)}` : "—"}
        </span>
      ),
    },
    {
      header: "Sched (d)",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-slate-700",
      cell: (item) => item.scheduleDaysImpact || "—",
    },
    {
      header: "Hours",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-slate-700",
      cell: (item) => item.laborHoursImpact || "—",
    },
    {
      header: "Requested",
      cellClassName: "text-xs text-slate-500",
      cell: (item) => new Date(item.requestedAt).toLocaleDateString(),
    },
  ];

  return (
    <ListPageLayout
      title="Change Log"
      description="CVRs, scope changes, and cost variations for the current project"
      newAction={
        <ChangelogDialog
          trigger={
            <Button disabled={!list.projectScoped}>
              <Plus className="mr-1 size-4" />
              New Change Item
            </Button>
          }
          onSubmit={list.handleSubmit}
        />
      }
      projectScoped={list.projectScoped}
      bannerText="Select a project from the header to start logging changes."
      cards={[
        { label: "Total Items", value: items.length.toString() },
        { label: "Open", value: stats.openCount.toString(), tone: "amber" },
        {
          label: "Executed",
          value: stats.executedCount.toString(),
          tone: "violet",
        },
        {
          label: "Total Cost Impact",
          value: `$${formatMoney(stats.totalCost)}`,
          tone: stats.totalCost >= 0 ? "slate" : "red",
        },
        {
          label: "Approved Cost",
          value: `$${formatMoney(stats.approvedCost)}`,
          tone: "emerald",
        },
      ]}
      search={list.filters.search}
      setSearch={list.filters.setSearch}
      searchPlaceholder="Search title, CVR, description, CBS…"
      statusFilter={list.filters.statusFilter}
      setStatusFilter={(v) =>
        list.filters.setStatusFilter(v as ChangeStatus | "")
      }
      statusOptions={[
        { value: "", label: "All statuses" },
        ...CHANGE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
      ]}
      disciplineFilter={list.filters.disciplineFilter}
      setDisciplineFilter={list.filters.setDisciplineFilter}
      filteredCount={list.filtered.length}
      totalCount={items.length}
      exportButton={
        <ExportCsvButton
          getItems={makeFilteredExport(
            queryClient,
            changeLogListFullQueryOptions(projectId),
            list.matchesFilters,
          )}
          disabled={list.filtered.length === 0}
          columns={cvrCsvColumns(areaLabel)}
          filenamePrefix="cvr-export"
        />
      }
      bulkBar={<BulkActionBar {...list.bulk.bar} />}
    >
      <ListTable
        items={list.filtered}
        columns={columns}
        emptyMessage="No change items match the current filters."
        bulk={list.bulk.table}
        renderRowDialog={(item, trigger) => (
          <ChangelogDialog
            trigger={trigger}
            initial={item}
            onSubmit={list.handleSubmit}
            onDelete={list.handleDelete}
            onTransition={list.handleTransition}
          />
        )}
      />
    </ListPageLayout>
  );
}

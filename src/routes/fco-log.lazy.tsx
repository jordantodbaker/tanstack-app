import { createLazyFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  HardHat,
  AlertTriangle,
  ArrowUpRight,
  Hourglass,
  Link as LinkIcon,
  ListChecks,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSelectedProject } from "~/lib/selected-project";
import { computeFcoStats } from "~/lib/list-stats";
import { makeFilteredExport } from "~/lib/filtered-export";
import {
  fcoListQueryOptions,
  fcoListFullQueryOptions,
  upsertFco,
  deleteFco,
  promoteFcoToCvr,
  transitionFco,
  invalidateFcoQueries,
  FCO_STATUSES,
  type FcoListItem,
  type FcoStatus,
  type UpsertFcoInput,
} from "~/utils/fcoLog";
import { invalidateChangeLogQueries } from "~/utils/changelog";
import {
  FCO_ORIGIN_LABELS,
  FCO_STATUS_LABELS,
  FcoPriorityBadge,
  FcoStatusBadge,
} from "~/components/FCOLog/FcoBadges";
import { FcoDialog } from "~/components/FCOLog/FcoDialog";
import { FilterSelect } from "~/components/ui/list-page";
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
import { fcoCsvColumns } from "~/utils/fcoLogCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { formatAreaLabel } from "~/utils/areaLabels";
import { FCO_TRANSITIONS } from "~/utils/workflow";

export const Route = createLazyFileRoute("/fco-log")({
  component: FcoLogPage,
});

function FcoLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(fcoListQueryOptions(projectId));
  const { data: areas = [] } = useQuery(areasByProjectQueryOptions(projectId));

  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  // FCO can promote to a CVR — invalidate both worlds. The CVR helper
  // also busts cvrOptions (the FCO dialog's CVR picker) for us.
  const invalidate = React.useCallback(() => {
    invalidateFcoQueries(queryClient, projectId);
    invalidateChangeLogQueries(queryClient, projectId);
  }, [queryClient, projectId]);

  // FCO-only linkage filter, ANDed with the shared filters.
  const [linkageFilter, setLinkageFilter] = React.useState<
    "" | "linked" | "unlinked"
  >("");
  const extraFilter = React.useCallback(
    (it: FcoListItem) => {
      if (linkageFilter === "linked" && it.linkedCvrId === null) return false;
      if (linkageFilter === "unlinked" && it.linkedCvrId !== null) return false;
      return true;
    },
    [linkageFilter],
  );

  const accessors = React.useMemo(
    () => ({
      discipline: (i: FcoListItem) => i.discipline,
      haystack: (i: FcoListItem) =>
        `${i.fcoNumber} ${i.title} ${areaLabel(i.locationArea)} ${i.initiatedBy} ${i.cbsCodes.join(" ")} ${i.drawingRefs.join(" ")} ${i.rfiNumbers.join(" ")} ${i.linkedCvrNumber ?? ""}`,
    }),
    [areaLabel],
  );

  const list = useListPage<FcoListItem, FcoStatus, UpsertFcoInput>({
    items,
    projectId,
    searchQ: Route.useSearch().q,
    upsertFn: upsertFco,
    deleteFn: deleteFco,
    transitionFn: transitionFco,
    promoteFn: (id) => promoteFcoToCvr({ data: { fcoId: id } }),
    invalidate,
    transitions: FCO_TRANSITIONS,
    entityNoun: "FCO",
    accessors,
    extraFilter,
  });

  const stats = React.useMemo(() => computeFcoStats(items), [items]);

  const columns: ListColumn<FcoListItem>[] = [
    {
      header: "FCO #",
      cellClassName: "align-top font-mono text-xs text-slate-700",
      cell: (item) => item.fcoNumber || `#${item.id}`,
    },
    {
      header: "Title / Location",
      cellClassName: "align-top font-medium text-slate-800",
      cell: (item) => (
        <div className="flex items-start gap-1.5">
          {item.workStopped && (
            <AlertTriangle className="size-3.5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div>
            <div>{item.title}</div>
            {item.locationArea && (
              <div className="text-xs text-slate-500 mt-0.5">
                {areaLabel(item.locationArea)}
              </div>
            )}
            {item.drawingRefs.length > 0 && (
              <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
                {item.drawingRefs.slice(0, 3).join(", ")}
                {item.drawingRefs.length > 3 &&
                  ` +${item.drawingRefs.length - 3}`}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Status",
      cellClassName: "align-top",
      cell: (item) => <FcoStatusBadge status={item.status} />,
    },
    {
      header: "Origin",
      cellClassName: "align-top text-slate-700 text-xs",
      cell: (item) => FCO_ORIGIN_LABELS[item.originType],
    },
    {
      header: "Priority",
      cellClassName: "align-top",
      cell: (item) => <FcoPriorityBadge priority={item.priority} />,
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
      header: "Est. Cost",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums",
      cell: (item) => (
        <span
          className={item.estimatedCost < 0 ? "text-red-600" : "text-slate-700"}
        >
          {item.estimatedCost ? `$${formatMoney(item.estimatedCost)}` : "—"}
        </span>
      ),
    },
    {
      header: "Hours",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums text-slate-700",
      cell: (item) => item.estimatedHours || "—",
    },
    {
      header: "Initiated",
      cellClassName: "align-top text-xs text-slate-500",
      cell: (item) => (
        <>
          <div>{new Date(item.initiatedAt).toLocaleDateString()}</div>
          {item.initiatedBy && (
            <div className="text-slate-400">by {item.initiatedBy}</div>
          )}
        </>
      ),
    },
    {
      header: "CVR Link",
      cellClassName: "align-top text-xs",
      cell: (item) =>
        item.linkedCvrId ? (
          <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-mono text-violet-700">
            <LinkIcon className="size-3" />
            {item.linkedCvrNumber || `#${item.linkedCvrId}`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <ArrowUpRight className="size-3" />
            Not linked
          </span>
        ),
    },
  ];

  return (
    <ListPageLayout
      icon={HardHat}
      iconClassName="text-amber-600"
      title="Field Change Order (FCO) Log"
      description={
        <>
          Track changes originating in the field — RFIs, design conflicts,
          site conditions — and promote them to CVRs in{" "}
          <Link to="/changelog" className="text-red-700 hover:underline">
            Change Log
          </Link>{" "}
          when approved.
        </>
      }
      newAction={
        <FcoDialog
          projectId={projectId}
          trigger={
            <Button disabled={!list.projectScoped}>
              <Plus className="mr-1 size-4" />
              New FCO
            </Button>
          }
          onSubmit={list.handleSubmit}
        />
      }
      projectScoped={list.projectScoped}
      bannerText="Select a project from the header to start logging field changes."
      cards={[
        {
          label: "Total FCOs",
          value: items.length.toString(),
          icon: ListChecks,
        },
        {
          label: "Open",
          value: stats.openCount.toString(),
          tone: "amber",
          icon: Hourglass,
        },
        {
          label: "Urgent / High",
          value: stats.urgentCount.toString(),
          tone: "red",
          icon: AlertTriangle,
        },
        {
          label: "Work Stopped",
          value: stats.workStopped.toString(),
          tone: stats.workStopped > 0 ? "red" : "slate",
          icon: AlertTriangle,
        },
        {
          label: "Linked to CVR",
          value: stats.linkedCount.toString(),
          tone: "violet",
          icon: LinkIcon,
        },
        {
          label: "Est. Cost Impact",
          value: `$${formatMoney(stats.totalCost)}`,
          tone: stats.totalCost >= 0 ? "slate" : "red",
        },
      ]}
      search={list.filters.search}
      setSearch={list.filters.setSearch}
      searchPlaceholder="Search FCO #, title, drawings, RFIs, CBS…"
      statusFilter={list.filters.statusFilter}
      setStatusFilter={(v) => list.filters.setStatusFilter(v as FcoStatus | "")}
      statusOptions={[
        { value: "", label: "All statuses" },
        ...FCO_STATUSES.map((s) => ({ value: s, label: FCO_STATUS_LABELS[s] })),
      ]}
      disciplineFilter={list.filters.disciplineFilter}
      setDisciplineFilter={list.filters.setDisciplineFilter}
      extraFilters={
        <FilterSelect
          label="CVR Link"
          value={linkageFilter}
          onChange={(v) => setLinkageFilter(v as "" | "linked" | "unlinked")}
          options={[
            { value: "", label: "Any" },
            { value: "linked", label: "Linked to CVR" },
            { value: "unlinked", label: "Not linked" },
          ]}
        />
      }
      filteredCount={list.filtered.length}
      totalCount={items.length}
      exportButton={
        <ExportCsvButton
          getItems={makeFilteredExport(
            queryClient,
            fcoListFullQueryOptions(projectId),
            list.matchesFilters,
          )}
          disabled={list.filtered.length === 0}
          columns={fcoCsvColumns(areaLabel)}
          filenamePrefix="fco-export"
        />
      }
      bulkBar={<BulkActionBar {...list.bulk.bar} />}
    >
      <ListTable
        items={list.filtered}
        columns={columns}
        emptyMessage="No field change orders match the current filters."
        bulk={list.bulk.table}
        rowClassName={(item) =>
          item.workStopped ? "bg-red-50/40 hover:bg-red-50" : undefined
        }
        renderRowDialog={(item, trigger) => (
          <FcoDialog
            projectId={projectId}
            trigger={trigger}
            initial={item}
            onSubmit={list.handleSubmit}
            onDelete={list.handleDelete}
            onPromote={list.handlePromote}
            onTransition={list.handleTransition}
          />
        )}
      />
    </ListPageLayout>
  );
}

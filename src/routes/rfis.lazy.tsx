import { createLazyFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  HelpCircle,
  Hourglass,
  ListChecks,
  Plus,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSelectedProject } from "~/lib/selected-project";
import { computeRfiStats } from "~/lib/list-stats";
import { makeFilteredExport } from "~/lib/filtered-export";
import {
  rfiListQueryOptions,
  rfiListFullQueryOptions,
  upsertRfi,
  deleteRfi,
  transitionRfi,
  promoteRfiToFco,
  invalidateRfiQueries,
  RFI_STATUSES,
  type RfiListItem,
  type RfiStatus,
  type UpsertRfiInput,
} from "~/utils/rfis";
import { invalidateFcoQueries } from "~/utils/fcoLog";
import { RFI_STATUS_LABELS } from "~/utils/rfiLabels";
import {
  RfiPriorityBadge,
  RfiStatusBadge,
} from "~/components/Rfi/RfiBadges";
import { RfiDialog } from "~/components/Rfi/RfiDialog";
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
import { rfiCsvColumns } from "~/utils/rfisCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { RFI_TRANSITIONS } from "~/utils/workflow";

export const Route = createLazyFileRoute("/rfis")({
  component: RfiLogPage,
});

function RfiLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(rfiListQueryOptions(projectId));
  const { data: areas = [] } = useQuery(areasByProjectQueryOptions(projectId));

  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  // RFI promotion creates an FCO; the FCO list cache must drop too so the
  // new FCO appears immediately if the FCO log is open in another tab.
  const invalidate = React.useCallback(() => {
    invalidateRfiQueries(queryClient, projectId);
    invalidateFcoQueries(queryClient, projectId);
  }, [queryClient, projectId]);

  // Slim list payload drops `question` and `response`; searching by RFI #,
  // subject, originator, responder, drawings/specs, and area covers the
  // common cases without pulling multi-paragraph text on every list visit.
  const accessors = React.useMemo(
    () => ({
      discipline: (i: RfiListItem) => i.discipline,
      haystack: (i: RfiListItem) =>
        `${i.rfiNumber} ${i.subject} ${i.initiatedBy} ${i.assignedTo} ${i.drawingRefs.join(" ")} ${i.specRefs.join(" ")} ${areaLabel(i.locationArea)}`,
    }),
    [areaLabel],
  );

  const list = useListPage<RfiListItem, RfiStatus, UpsertRfiInput>({
    items,
    projectId,
    searchQ: Route.useSearch().q,
    upsertFn: upsertRfi,
    deleteFn: deleteRfi,
    transitionFn: transitionRfi,
    promoteFn: (id) => promoteRfiToFco({ data: { rfiId: id } }),
    invalidate,
    transitions: RFI_TRANSITIONS,
    entityNoun: "RFI",
    accessors,
  });

  const stats = React.useMemo(() => computeRfiStats(items, new Date()), [items]);

  const columns: ListColumn<RfiListItem>[] = [
    {
      header: "RFI #",
      cellClassName: "align-top font-mono text-xs text-slate-700",
      cell: (item) => item.rfiNumber || `#${item.id}`,
    },
    {
      header: "Subject",
      cellClassName: "align-top font-medium text-slate-800",
      cell: (item) => (
        <>
          <div>{item.subject}</div>
          {item.drawingRefs.length > 0 && (
            <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
              {item.drawingRefs.slice(0, 3).join(", ")}
              {item.drawingRefs.length > 3 &&
                ` +${item.drawingRefs.length - 3}`}
            </div>
          )}
        </>
      ),
    },
    {
      header: "Status",
      cellClassName: "align-top",
      cell: (item) => <RfiStatusBadge status={item.status} />,
    },
    {
      header: "Priority",
      cellClassName: "align-top",
      cell: (item) => <RfiPriorityBadge priority={item.priority} />,
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
      header: "Assigned to",
      cellClassName: "align-top text-slate-700",
      cell: (item) => item.assignedTo || "—",
    },
    {
      header: "Due",
      cellClassName: "align-top text-xs text-slate-500",
      cell: (item) =>
        item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—",
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
  ];

  return (
    <ListPageLayout
      icon={HelpCircle}
      iconClassName="text-indigo-600"
      title="RFIs"
      description="Requests for information — questions to the designer/engineer. Promote to an FCO if the answer drives new scope."
      newAction={
        <RfiDialog
          projectId={projectId}
          trigger={
            <Button disabled={!list.projectScoped}>
              <Plus className="mr-1 size-4" />
              New RFI
            </Button>
          }
          onSubmit={list.handleSubmit}
        />
      }
      projectScoped={list.projectScoped}
      bannerText="Select a project from the header to start logging RFIs."
      cards={[
        {
          label: "Total RFIs",
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
          label: "Awaiting close",
          value: stats.awaitingClose.toString(),
          tone: "violet",
        },
        {
          label: "Past due",
          value: stats.pastDue.toString(),
          tone: stats.pastDue > 0 ? "red" : "slate",
          icon: CalendarClock,
        },
        {
          label: "Suspects impact",
          value: stats.suspectsImpact.toString(),
          tone: stats.suspectsImpact > 0 ? "red" : "slate",
          icon: AlertTriangle,
        },
      ]}
      search={list.filters.search}
      setSearch={list.filters.setSearch}
      searchPlaceholder="Search RFI #, subject, question, drawings, specs…"
      statusFilter={list.filters.statusFilter}
      setStatusFilter={(v) => list.filters.setStatusFilter(v as RfiStatus | "")}
      statusOptions={[
        { value: "", label: "All statuses" },
        ...RFI_STATUSES.map((s) => ({ value: s, label: RFI_STATUS_LABELS[s] })),
      ]}
      disciplineFilter={list.filters.disciplineFilter}
      setDisciplineFilter={list.filters.setDisciplineFilter}
      filteredCount={list.filtered.length}
      totalCount={items.length}
      exportButton={
        <ExportCsvButton
          getItems={makeFilteredExport(
            queryClient,
            rfiListFullQueryOptions(projectId),
            list.matchesFilters,
          )}
          disabled={list.filtered.length === 0}
          columns={rfiCsvColumns(areaLabel)}
          filenamePrefix="rfi-export"
        />
      }
      bulkBar={<BulkActionBar {...list.bulk.bar} />}
    >
      <ListTable
        items={list.filtered}
        columns={columns}
        emptyMessage="No RFIs match the current filters."
        bulk={list.bulk.table}
        renderRowDialog={(item, trigger) => (
          <RfiDialog
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

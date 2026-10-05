import { createLazyFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Handshake,
  Hourglass,
  Plus,
  Receipt,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSelectedProject } from "~/lib/selected-project";
import { computePcoStats } from "~/lib/list-stats";
import { makeFilteredExport } from "~/lib/filtered-export";
import {
  pcoListQueryOptions,
  pcoListFullQueryOptions,
  upsertPco,
  deletePco,
  transitionPco,
  invalidatePcoQueries,
  PCO_STATUSES,
  type PcoListItem,
  type PcoStatus,
  type UpsertPcoInput,
} from "~/utils/pco";
import { PCO_STATUS_LABELS } from "~/utils/pcoLabels";
import { pcoCsvColumns } from "~/utils/pcoCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import {
  PcoPriorityBadge,
  PcoStatusBadge,
} from "~/components/Pco/PcoBadges";
import { PcoDialog } from "~/components/Pco/PcoDialog";
import {
  useListPage,
  ListPageLayout,
  ListTable,
  BulkActionBar,
  type ListColumn,
} from "~/components/ui/list-view";
import { formatMoney } from "~/lib/formatting";
import { PCO_TRANSITIONS } from "~/utils/workflow";

export const Route = createLazyFileRoute("/pco")({
  component: PcoLogPage,
});

function PcoLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(pcoListQueryOptions(projectId));

  // `invalidatePcoQueries` already busts the CVR list (a PCO upsert can
  // re-link CVRs).
  const invalidate = React.useCallback(
    () => invalidatePcoQueries(queryClient, projectId),
    [queryClient, projectId],
  );

  // PCO has no discipline/area dimension. Slim list payload drops
  // `description` / `reasonNarrative` / `notes`; search by PCO #, owner ref,
  // title, owner rep, invoice covers the common cases.
  const accessors = React.useMemo(
    () => ({
      haystack: (i: PcoListItem) =>
        `${i.pcoNumber} ${i.ownerReference} ${i.title} ${i.ownerRepName} ${i.ownerRepEmail} ${i.invoiceNumber}`,
    }),
    [],
  );

  const list = useListPage<PcoListItem, PcoStatus, UpsertPcoInput>({
    items,
    projectId,
    searchQ: Route.useSearch().q,
    upsertFn: upsertPco,
    deleteFn: deletePco,
    transitionFn: transitionPco,
    invalidate,
    transitions: PCO_TRANSITIONS,
    entityNoun: "PCO",
    accessors,
  });

  const stats = React.useMemo(() => computePcoStats(items), [items]);

  const columns: ListColumn<PcoListItem>[] = [
    {
      header: "PCO #",
      cellClassName: "align-top font-mono text-xs text-slate-700",
      cell: (item) => item.pcoNumber || `#${item.id}`,
    },
    {
      header: "Title",
      cellClassName: "align-top font-medium text-slate-800",
      cell: (item) => (
        <>
          <div>{item.title}</div>
          {item.ownerRepName && (
            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
              {item.ownerRepName}
            </div>
          )}
        </>
      ),
    },
    {
      header: "Status",
      cellClassName: "align-top",
      cell: (item) => <PcoStatusBadge status={item.status} />,
    },
    {
      header: "Priority",
      cellClassName: "align-top",
      cell: (item) => <PcoPriorityBadge priority={item.priority} />,
    },
    {
      header: "Requested",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums text-slate-700",
      cell: (item) => formatMoney(item.requestedAmount),
    },
    {
      header: "Approved",
      headerClassName: "text-right",
      cellClassName: "align-top text-right tabular-nums text-slate-700",
      cell: (item) =>
        item.approvedAmount > 0 ? formatMoney(item.approvedAmount) : "—",
    },
    {
      header: "CVRs",
      cellClassName: "align-top text-xs text-slate-500",
      cell: (item) =>
        item.linkedCvrs.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span>
            {item.linkedCvrs.length}{" "}
            {item.linkedCvrs.length === 1 ? "CVR" : "CVRs"}
          </span>
        ),
    },
    {
      header: "Submitted",
      cellClassName: "align-top text-xs text-slate-500",
      cell: (item) =>
        item.submittedAt
          ? new Date(item.submittedAt).toLocaleDateString()
          : "—",
    },
    {
      header: "Owner ref",
      cellClassName: "align-top font-mono text-xs text-slate-500",
      cell: (item) => item.ownerReference || "—",
    },
  ];

  return (
    <ListPageLayout
      icon={Handshake}
      iconClassName="text-sky-600"
      title="Owner Change Orders (PCOs)"
      description="What the EPC is billing the owner. Bundle approved CVRs into a PCO and track it from submission through invoicing to payment."
      newAction={
        <PcoDialog
          projectId={projectId}
          trigger={
            <Button disabled={!list.projectScoped}>
              <Plus className="mr-1 size-4" />
              New PCO
            </Button>
          }
          onSubmit={list.handleSubmit}
        />
      }
      projectScoped={list.projectScoped}
      bannerText="Select a project from the header to start logging PCOs."
      cards={[
        {
          label: "Total PCOs",
          value: items.length.toString(),
          icon: ClipboardList,
        },
        {
          label: `Open (${stats.openCount})`,
          value: formatMoney(stats.openValue),
          tone: "amber",
          icon: Hourglass,
        },
        {
          label: `Approved unbilled (${stats.approvedCount})`,
          value: formatMoney(stats.approvedValue),
          tone: "violet",
          icon: CheckCircle2,
        },
        {
          label: `Invoiced unpaid (${stats.invoicedCount})`,
          value: formatMoney(stats.invoicedValue),
          tone: stats.invoicedValue > 0 ? "red" : "slate",
          icon: Receipt,
        },
        {
          label: "Collected",
          value: formatMoney(stats.closedValue),
          tone: stats.closedValue > 0 ? "emerald" : "slate",
          icon: CircleDollarSign,
        },
      ]}
      search={list.filters.search}
      setSearch={list.filters.setSearch}
      searchPlaceholder="Search PCO #, owner ref, title, invoice #…"
      statusFilter={list.filters.statusFilter}
      setStatusFilter={(v) => list.filters.setStatusFilter(v as PcoStatus | "")}
      statusOptions={[
        { value: "", label: "All statuses" },
        ...PCO_STATUSES.map((s) => ({ value: s, label: PCO_STATUS_LABELS[s] })),
      ]}
      filteredCount={list.filtered.length}
      totalCount={items.length}
      exportButton={
        <ExportCsvButton
          getItems={makeFilteredExport(
            queryClient,
            pcoListFullQueryOptions(projectId),
            list.matchesFilters,
          )}
          disabled={list.filtered.length === 0}
          columns={pcoCsvColumns()}
          filenamePrefix="pco-export"
        />
      }
      bulkBar={<BulkActionBar {...list.bulk.bar} />}
    >
      <ListTable
        items={list.filtered}
        columns={columns}
        emptyMessage="No PCOs match the current filters."
        bulk={list.bulk.table}
        renderRowDialog={(item, trigger) => (
          <PcoDialog
            projectId={projectId}
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

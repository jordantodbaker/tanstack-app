import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Handshake,
  Hourglass,
  Plus,
  Receipt,
  Search,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import { useListFilters } from "~/lib/use-list-filters";
import {
  pcoListQueryOptions,
  pcoListFullQueryOptions,
  upsertPco,
  deletePco,
  transitionPco,
  invalidatePcoQueries,
  PCO_STATUSES,
  PCO_OPEN_STATUSES,
  type PcoItem,
  type PcoListItem,
  type PcoStatus,
  type UpsertPcoInput,
} from "~/utils/pco";
import { PCO_STATUS_LABELS } from "~/utils/pcoLabels";
import {
  PcoPriorityBadge,
  PcoStatusBadge,
} from "~/components/Pco/PcoBadges";
import { PcoDialog } from "~/components/Pco/PcoDialog";
import {
  FilterSelect,
  StatCard,
  TableEmptyState,
  Th,
} from "~/components/ui/list-page";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { formatMoney } from "~/lib/formatting";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";

export const Route = createFileRoute("/pco")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(pcoListQueryOptions(projectId)),
      );
    }
  },
  // `?q` lets the global search palette deep-link here with a record's number
  // pre-seeded into the page search box.
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s.q === "string" ? { q: s.q } : {},
  component: PcoLogPage,
});

function PcoLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(pcoListQueryOptions(projectId));

  // `invalidatePcoQueries` already busts the CVR list (a PCO upsert can
  // re-link CVRs). Previously this route inlined `["changelog", …]`
  // lowercase, which never matched the actual `["changeLog", …]` key, so
  // the CVR list silently failed to refresh after a PCO save.
  const invalidate = () => invalidatePcoQueries(queryClient, projectId);

  const upsert = useMutation({
    mutationFn: (input: UpsertPcoInput) => upsertPco({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deletePco({ data: { id } }),
    onSuccess: invalidate,
  });
  const transition = useMutation({
    mutationFn: (input: { id: number; action: string }) =>
      transitionPco({ data: input }),
    onSuccess: invalidate,
  });

  const { q } = Route.useSearch();
  const { search, setSearch, statusFilter, setStatusFilter } =
    useListFilters<PcoStatus>(q);

  // Slim list payload drops `description` / `reasonNarrative` / `notes`;
  // search by PCO #, owner ref, title, owner rep, invoice covers the
  // common cases without pulling multi-paragraph text on every visit.
  const matchesFilters = React.useCallback(
    (it: PcoListItem): boolean => {
      const q = search.trim().toLowerCase();
      if (statusFilter && it.status !== statusFilter) return false;
      if (q) {
        const haystack =
          `${it.pcoNumber} ${it.ownerReference} ${it.title} ${it.ownerRepName} ${it.ownerRepEmail} ${it.invoiceNumber}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    },
    [search, statusFilter],
  );

  const filtered = React.useMemo(
    () => items.filter(matchesFilters),
    [items, matchesFilters],
  );

  const stats = React.useMemo(() => {
    // "Open" — pre-approval bucket. Sums requested $ (what we're chasing
    // approval on).
    const open = items.filter((i) => PCO_OPEN_STATUSES.includes(i.status));
    const openValue = open.reduce((s, p) => s + p.requestedAmount, 0);
    // "Approved unbilled" — owner agreed but no invoice yet. Sums
    // approvedAmount (the real number).
    const approved = items.filter((i) => i.status === "APPROVED");
    const approvedValue = approved.reduce((s, p) => s + p.approvedAmount, 0);
    // "Invoiced unpaid" — outstanding receivable.
    const invoiced = items.filter((i) => i.status === "INVOICED");
    const invoicedValue = invoiced.reduce((s, p) => s + p.approvedAmount, 0);
    // Closed total — paid this engagement.
    const closed = items.filter((i) => i.status === "CLOSED");
    const closedValue = closed.reduce((s, p) => s + p.approvedAmount, 0);
    return {
      openCount: open.length,
      openValue,
      approvedCount: approved.length,
      approvedValue,
      invoicedCount: invoiced.length,
      invoicedValue,
      closedCount: closed.length,
      closedValue,
    };
  }, [items]);

  const projectScoped = projectId !== null;

  function handleSubmit(input: Omit<UpsertPcoInput, "projectId">) {
    if (!projectScoped) return Promise.resolve();
    return upsert.mutateAsync({ ...input, projectId });
  }

  function handleDelete(id: number) {
    return remove.mutateAsync(id);
  }

  function handleTransition(input: { id: number; action: string }) {
    return transition.mutateAsync(input);
  }

  return (
    <main className="p-4 max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Handshake className="size-6 text-sky-600" />
            Owner Change Orders (PCOs)
          </h1>
          <p className="text-sm text-slate-500">
            What the EPC is billing the owner. Bundle approved CVRs into a
            PCO and track it from submission through invoicing to payment.
          </p>
        </div>
        <PcoDialog
          projectId={projectId}
          trigger={
            <Button disabled={!projectScoped}>
              <Plus className="mr-1 size-4" />
              New PCO
            </Button>
          }
          onSubmit={handleSubmit}
        />
      </div>

      {!projectScoped && (
        <SelectProjectBanner>
          Select a project from the header to start logging PCOs.
        </SelectProjectBanner>
      )}

      <PcoStatsCards
        total={items.length}
        openCount={stats.openCount}
        openValue={stats.openValue}
        approvedCount={stats.approvedCount}
        approvedValue={stats.approvedValue}
        invoicedCount={stats.invoicedCount}
        invoicedValue={stats.invoicedValue}
        closedValue={stats.closedValue}
      />

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PCO #, owner ref, title, invoice #…"
            className="pl-7 w-80"
          />
        </div>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as PcoStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            ...PCO_STATUSES.map((s) => ({
              value: s,
              label: PCO_STATUS_LABELS[s],
            })),
          ]}
        />
        <span className="ml-auto text-xs text-slate-500">
          Showing {filtered.length} of {items.length}
        </span>
      </div>

      <PcoTable
        items={filtered}
        projectId={projectId}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onTransition={handleTransition}
      />
    </main>
  );
}

function PcoStatsCards({
  total,
  openCount,
  openValue,
  approvedCount,
  approvedValue,
  invoicedCount,
  invoicedValue,
  closedValue,
}: {
  total: number;
  openCount: number;
  openValue: number;
  approvedCount: number;
  approvedValue: number;
  invoicedCount: number;
  invoicedValue: number;
  closedValue: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard
        label="Total PCOs"
        value={total.toString()}
        icon={ClipboardList}
      />
      <StatCard
        label={`Open (${openCount})`}
        value={formatMoney(openValue)}
        tone="amber"
        icon={Hourglass}
      />
      <StatCard
        label={`Approved unbilled (${approvedCount})`}
        value={formatMoney(approvedValue)}
        tone="violet"
        icon={CheckCircle2}
      />
      <StatCard
        label={`Invoiced unpaid (${invoicedCount})`}
        value={formatMoney(invoicedValue)}
        tone={invoicedValue > 0 ? "red" : "slate"}
        icon={Receipt}
      />
      <StatCard
        label="Collected"
        value={formatMoney(closedValue)}
        tone={closedValue > 0 ? "emerald" : "slate"}
        icon={CircleDollarSign}
      />
    </div>
  );
}

function PcoTable({
  items,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
}: {
  items: PcoListItem[];
  projectId: number | null;
  onSubmit: (input: Omit<UpsertPcoInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
}) {
  if (items.length === 0) {
    return <TableEmptyState message="No PCOs match the current filters." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>PCO #</Th>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th className="text-right">Requested</Th>
            <Th className="text-right">Approved</Th>
            <Th>CVRs</Th>
            <Th>Submitted</Th>
            <Th>Owner ref</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <PcoRow
              key={item.id}
              item={item}
              projectId={projectId}
              onSubmit={onSubmit}
              onDelete={onDelete}
              onTransition={onTransition}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PcoRow({
  item,
  projectId,
  onSubmit,
  onDelete,
  onTransition,
}: {
  item: PcoListItem;
  projectId: number | null;
  onSubmit: (input: Omit<UpsertPcoInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  return (
    <PcoDialog
      projectId={projectId}
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {item.pcoNumber || `#${item.id}`}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            <div>{item.title}</div>
            {item.ownerRepName && (
              <div className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
                {item.ownerRepName}
              </div>
            )}
          </td>
          <td className={cellCls}>
            <PcoStatusBadge status={item.status} />
          </td>
          <td className={cellCls}>
            <PcoPriorityBadge priority={item.priority} />
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {formatMoney(item.requestedAmount)}
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {item.approvedAmount > 0
              ? formatMoney(item.approvedAmount)
              : "—"}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            {item.linkedCvrs.length === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span>
                {item.linkedCvrs.length}{" "}
                {item.linkedCvrs.length === 1 ? "CVR" : "CVRs"}
              </span>
            )}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            {item.submittedAt
              ? new Date(item.submittedAt).toLocaleDateString()
              : "—"}
          </td>
          <td className={`${cellCls} font-mono text-xs text-slate-500`}>
            {item.ownerReference || "—"}
          </td>
        </tr>
      }
      initial={item}
      onSubmit={onSubmit}
      onDelete={onDelete}
      onTransition={onTransition}
    />
  );
}

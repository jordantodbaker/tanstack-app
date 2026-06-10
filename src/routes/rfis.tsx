import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  HelpCircle,
  Hourglass,
  ListChecks,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import { useListFilters } from "~/lib/use-list-filters";
import {
  rfiListQueryOptions,
  rfiListFullQueryOptions,
  upsertRfi,
  deleteRfi,
  transitionRfi,
  promoteRfiToFco,
  invalidateRfiQueries,
  RFI_STATUSES,
  RFI_OPEN_STATUSES,
  type RfiItem,
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
import { rfiCsvColumns } from "~/utils/rfisCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";

export const Route = createFileRoute("/rfis")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(rfiListQueryOptions(projectId)),
      );
    }
  },
  // `?q` lets the global search palette deep-link here with a record's number
  // pre-seeded into the page search box.
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s.q === "string" ? { q: s.q } : {},
  component: RfiLogPage,
});

function isPast(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(iso) < startOfToday;
}

function RfiLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(rfiListQueryOptions(projectId));
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(projectId),
  );

  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  // RFI promotion creates an FCO; the FCO list cache must drop too so the
  // new FCO appears immediately if the FCO log is open in another tab.
  const invalidate = () => {
    invalidateRfiQueries(queryClient, projectId);
    invalidateFcoQueries(queryClient, projectId);
  };

  const upsert = useMutation({
    mutationFn: (input: UpsertRfiInput) => upsertRfi({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteRfi({ data: { id } }),
    onSuccess: invalidate,
  });
  const transition = useMutation({
    mutationFn: (input: { id: number; action: string }) =>
      transitionRfi({ data: input }),
    onSuccess: invalidate,
  });
  const promote = useMutation({
    mutationFn: (rfiId: number) => promoteRfiToFco({ data: { rfiId } }),
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
  } = useListFilters<RfiStatus>(q);

  // Closure over the active filter UI state. The slim list payload drops
  // `question` and `response`; searching by RFI #, subject, originator,
  // responder, drawings/specs, and area covers the common cases without
  // pulling multi-paragraph text on every list visit.
  const matchesFilters = React.useCallback(
    (it: RfiListItem): boolean => {
      const q = search.trim().toLowerCase();
      if (statusFilter && it.status !== statusFilter) return false;
      if (disciplineFilter && it.discipline !== disciplineFilter) return false;
      if (q) {
        const haystack =
          `${it.rfiNumber} ${it.subject} ${it.initiatedBy} ${it.assignedTo} ${it.drawingRefs.join(" ")} ${it.specRefs.join(" ")} ${areaLabel(it.locationArea)}`.toLowerCase();
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
    const openCount = items.filter((i) =>
      RFI_OPEN_STATUSES.includes(i.status),
    ).length;
    const awaitingClose = items.filter((i) => i.status === "ANSWERED").length;
    const pastDue = items.filter(
      (i) => RFI_OPEN_STATUSES.includes(i.status) && isPast(i.dueDate, now),
    ).length;
    const suspectsImpact = items.filter(
      (i) =>
        RFI_OPEN_STATUSES.includes(i.status) &&
        (i.suspectsCostImpact || i.suspectsScheduleImpact),
    ).length;
    return { openCount, awaitingClose, pastDue, suspectsImpact };
  }, [items]);

  const projectScoped = projectId !== null;

  function handleSubmit(input: Omit<UpsertRfiInput, "projectId">) {
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
    <main className="p-4 max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <HelpCircle className="size-6 text-indigo-600" />
            RFIs
          </h1>
          <p className="text-sm text-slate-500">
            Requests for information — questions to the designer/engineer.
            Promote to an FCO if the answer drives new scope.
          </p>
        </div>
        <RfiDialog
          projectId={projectId}
          trigger={
            <Button disabled={!projectScoped}>
              <Plus className="mr-1 size-4" />
              New RFI
            </Button>
          }
          onSubmit={handleSubmit}
        />
      </div>

      {!projectScoped && (
        <SelectProjectBanner>
          Select a project from the header to start logging RFIs.
        </SelectProjectBanner>
      )}

      <RfiStatsCards
        total={items.length}
        openCount={stats.openCount}
        awaitingClose={stats.awaitingClose}
        pastDue={stats.pastDue}
        suspectsImpact={stats.suspectsImpact}
      />

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RFI #, subject, question, drawings, specs…"
            className="pl-7 w-80"
          />
        </div>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as RfiStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            ...RFI_STATUSES.map((s) => ({
              value: s,
              label: RFI_STATUS_LABELS[s],
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
        <span className="ml-auto text-xs text-slate-500">
          Showing {filtered.length} of {items.length}
        </span>
        <ExportCsvButton
          getItems={async () => {
            const full = await queryClient.fetchQuery(
              rfiListFullQueryOptions(projectId),
            );
            return full.filter(matchesFilters);
          }}
          disabled={filtered.length === 0}
          columns={rfiCsvColumns(areaLabel)}
          filenamePrefix="rfi-export"
        />
      </div>

      <RfiTable
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

function RfiStatsCards({
  total,
  openCount,
  awaitingClose,
  pastDue,
  suspectsImpact,
}: {
  total: number;
  openCount: number;
  awaitingClose: number;
  pastDue: number;
  suspectsImpact: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard label="Total RFIs" value={total.toString()} icon={ListChecks} />
      <StatCard
        label="Open"
        value={openCount.toString()}
        tone="amber"
        icon={Hourglass}
      />
      <StatCard
        label="Awaiting close"
        value={awaitingClose.toString()}
        tone="violet"
      />
      <StatCard
        label="Past due"
        value={pastDue.toString()}
        tone={pastDue > 0 ? "red" : "slate"}
        icon={CalendarClock}
      />
      <StatCard
        label="Suspects impact"
        value={suspectsImpact.toString()}
        tone={suspectsImpact > 0 ? "red" : "slate"}
        icon={AlertTriangle}
      />
    </div>
  );
}

function RfiTable({
  items,
  projectId,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
}: {
  items: RfiListItem[];
  projectId: number | null;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertRfiInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  onPromote: (id: number) => Promise<unknown>;
}) {
  if (items.length === 0) {
    return <TableEmptyState message="No RFIs match the current filters." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>RFI #</Th>
            <Th>Subject</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th>Discipline</Th>
            <Th>Area</Th>
            <Th>Assigned to</Th>
            <Th>Due</Th>
            <Th>Initiated</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <RfiRow
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

function RfiRow({
  item,
  projectId,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
  onPromote,
}: {
  item: RfiListItem;
  projectId: number | null;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertRfiInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  onPromote: (id: number) => Promise<unknown>;
}) {
  const disciplineLabel = item.discipline
    ? (disciplineById[item.discipline]?.label ?? item.discipline)
    : "—";
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  return (
    <RfiDialog
      projectId={projectId}
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {item.rfiNumber || `#${item.id}`}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            <div>{item.subject}</div>
            {item.drawingRefs.length > 0 && (
              <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
                {item.drawingRefs.slice(0, 3).join(", ")}
                {item.drawingRefs.length > 3 &&
                  ` +${item.drawingRefs.length - 3}`}
              </div>
            )}
          </td>
          <td className={cellCls}>
            <RfiStatusBadge status={item.status} />
          </td>
          <td className={cellCls}>
            <RfiPriorityBadge priority={item.priority} />
          </td>
          <td className={`${cellCls} text-slate-700`}>{disciplineLabel}</td>
          <td className={`${cellCls} text-slate-700`}>
            {item.locationArea ? areaLabel(item.locationArea) : "—"}
          </td>
          <td className={`${cellCls} text-slate-700`}>
            {item.assignedTo || "—"}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            {item.dueDate
              ? new Date(item.dueDate).toLocaleDateString()
              : "—"}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            <div>{new Date(item.initiatedAt).toLocaleDateString()}</div>
            {item.initiatedBy && (
              <div className="text-slate-400">by {item.initiatedBy}</div>
            )}
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

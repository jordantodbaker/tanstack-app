import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import {
  changeLogListQueryOptions,
  changeLogListFullQueryOptions,
  upsertChangeLog,
  deleteChangeLog,
  transitionChangeLog,
  invalidateChangeLogQueries,
  CHANGE_STATUSES,
  CVR_OPEN_STATUSES,
  type ChangeLogItem,
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
import { formatMoney } from "~/lib/formatting";
import { cvrCsvColumns } from "~/utils/changelogCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";
import { formatAreaLabel } from "~/utils/areaLabels";

export const Route = createFileRoute("/changelog")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(
          changeLogListQueryOptions(projectId),
        ),
      );
    }
  },
  // `?q` lets the global search palette deep-link here with a record's number
  // pre-seeded into the page search box.
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s.q === "string" ? { q: s.q } : {},
  component: ChangelogPage,
});

function ChangelogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(changeLogListQueryOptions(projectId));
  // CVRs hold an Area.id as a string; resolve to "displayId — name" for the
  // table and the search haystack. Empty `area` means project-wide (no link).
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(projectId),
  );
  const areaLabel = React.useCallback(
    (raw: string) => formatAreaLabel(raw, areas),
    [areas],
  );

  const invalidate = () => invalidateChangeLogQueries(queryClient, projectId);

  const upsert = useMutation({
    mutationFn: (input: UpsertChangeLogInput) =>
      upsertChangeLog({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteChangeLog({ data: { id } }),
    onSuccess: invalidate,
  });
  const transition = useMutation({
    mutationFn: (input: { id: number; action: string }) =>
      transitionChangeLog({ data: input }),
    onSuccess: invalidate,
  });

  const { q } = Route.useSearch();
  const [search, setSearch] = React.useState(q ?? "");
  // Re-seed when navigated here with a new `q` (cross-entity nav remounts, so
  // the initializer covers that; this covers same-route re-navigation).
  React.useEffect(() => {
    if (q !== undefined) setSearch(q);
  }, [q]);
  const [statusFilter, setStatusFilter] = React.useState<"" | ChangeStatus>(
    "",
  );
  const [disciplineFilter, setDisciplineFilter] = React.useState("");

  // Slim list payload drops `description` / `notes` / `reasonCode`;
  // search by CVR #, title, originator, approver, CBS, area covers the
  // common cases without pulling multi-paragraph text on every visit.
  const matchesFilters = React.useCallback(
    (it: ChangeLogListItem): boolean => {
      const q = search.trim().toLowerCase();
      if (statusFilter && it.status !== statusFilter) return false;
      if (disciplineFilter && it.discipline !== disciplineFilter) return false;
      if (q) {
        const haystack =
          `${it.cvrNumber} ${it.title} ${it.originator} ${it.approver} ${it.cbsCodes.join(` `)} ${areaLabel(it.area)}`.toLowerCase();
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
    const totalCost = items.reduce((acc, i) => acc + i.costImpact, 0);
    const approvedCost = items
      .filter((i) => i.status === "APPROVED" || i.status === "EXECUTED")
      .reduce((acc, i) => acc + i.costImpact, 0);
    const openCount = items.filter((i) =>
      CVR_OPEN_STATUSES.includes(i.status),
    ).length;
    const executedCount = items.filter((i) => i.status === "EXECUTED").length;
    return { totalCost, approvedCost, openCount, executedCount };
  }, [items]);

  const projectScoped = projectId !== null;

  function handleSubmit(input: Omit<UpsertChangeLogInput, "projectId">) {
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
          <h1 className="text-2xl font-bold text-slate-800">Change Log</h1>
          <p className="text-sm text-slate-500">
            CVRs, scope changes, and cost variations for the current project
          </p>
        </div>
        <ChangelogDialog
          trigger={
            <Button disabled={!projectScoped}>
              <Plus className="mr-1 size-4" />
              New Change Item
            </Button>
          }
          onSubmit={handleSubmit}
        />
      </div>

      {!projectScoped && (
        <SelectProjectBanner>
          Select a project from the header to start logging changes.
        </SelectProjectBanner>
      )}

      <StatsCards
        total={items.length}
        openCount={stats.openCount}
        executedCount={stats.executedCount}
        totalCost={stats.totalCost}
        approvedCost={stats.approvedCost}
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, CVR, description, CBS…"
            className="pl-7 w-80"
          />
        </div>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ChangeStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            ...CHANGE_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABELS[s],
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
              changeLogListFullQueryOptions(projectId),
            );
            return full.filter(matchesFilters);
          }}
          disabled={filtered.length === 0}
          columns={cvrCsvColumns(areaLabel)}
          filenamePrefix="cvr-export"
        />
      </div>

      <ChangelogTable
        items={filtered}
        areaLabel={areaLabel}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onTransition={handleTransition}
      />
    </main>
  );
}

function StatsCards({
  total,
  openCount,
  executedCount,
  totalCost,
  approvedCost,
}: {
  total: number;
  openCount: number;
  executedCount: number;
  totalCost: number;
  approvedCost: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard label="Total Items" value={total.toString()} />
      <StatCard
        label="Open"
        value={openCount.toString()}
        tone="amber"
      />
      <StatCard
        label="Executed"
        value={executedCount.toString()}
        tone="violet"
      />
      <StatCard
        label="Total Cost Impact"
        value={`$${formatMoney(totalCost)}`}
        tone={totalCost >= 0 ? "slate" : "red"}
      />
      <StatCard
        label="Approved Cost"
        value={`$${formatMoney(approvedCost)}`}
        tone="emerald"
      />
    </div>
  );
}

function ChangelogTable({
  items,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
}: {
  items: ChangeLogListItem[];
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertChangeLogInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
}) {
  if (items.length === 0) {
    return (
      <TableEmptyState message="No change items match the current filters." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>CVR</Th>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Type</Th>
            <Th>Discipline</Th>
            <Th>Area</Th>
            <Th>Risk</Th>
            <Th className="text-right">Cost $</Th>
            <Th className="text-right">Sched (d)</Th>
            <Th className="text-right">Hours</Th>
            <Th>Requested</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ChangelogRow
              key={item.id}
              item={item}
              areaLabel={areaLabel}
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

function ChangelogRow({
  item,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
}: {
  item: ChangeLogListItem;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertChangeLogInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
}) {
  const disciplineLabel = item.discipline
    ? (disciplineById[item.discipline]?.label ?? item.discipline)
    : "—";
  const areaLabelText = item.area ? areaLabel(item.area) : "—";
  const cellCls = "px-3 py-2 border-b border-slate-100";
  return (
    <ChangelogDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {item.cvrNumber || "—"}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            {item.title}
            {item.cbsCodes.length > 0 && (
              <div className="mt-0.5 text-xs text-slate-400 font-mono truncate max-w-md">
                {item.cbsCodes.slice(0, 3).join(", ")}
                {item.cbsCodes.length > 3 &&
                  ` +${item.cbsCodes.length - 3}`}
              </div>
            )}
          </td>
          <td className={cellCls}>
            <StatusBadge status={item.status} />
          </td>
          <td className={`${cellCls} text-slate-700`}>
            {TYPE_LABELS[item.type]}
          </td>
          <td className={`${cellCls} text-slate-700`}>{disciplineLabel}</td>
          <td className={`${cellCls} text-slate-700`}>{areaLabelText}</td>
          <td className={cellCls}>
            <RiskBadge level={item.riskLevel} />
          </td>
          <td
            className={`${cellCls} text-right tabular-nums ${item.costImpact < 0 ? `text-red-600` : `text-slate-700`}`}
          >
            {item.costImpact ? `$${formatMoney(item.costImpact)}` : `—`}
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {item.scheduleDaysImpact || "—"}
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {item.laborHoursImpact || "—"}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            {new Date(item.requestedAt).toLocaleDateString()}
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

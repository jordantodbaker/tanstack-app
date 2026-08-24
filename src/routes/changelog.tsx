import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import { useListFilters } from "~/lib/use-list-filters";
import { computeCvrStats } from "~/lib/list-stats";
import { matchesListFilters } from "~/lib/list-filtering";
import { makeFilteredExport } from "~/lib/filtered-export";
import {
  changeLogListQueryOptions,
  changeLogListFullQueryOptions,
  upsertChangeLog,
  deleteChangeLog,
  transitionChangeLog,
  invalidateChangeLogQueries,
  CHANGE_STATUSES,
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
  StatCardRow,
  TableEmptyState,
  Th,
} from "~/components/ui/list-page";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import {
  disciplineById,
  DISCIPLINE_FILTER_OPTIONS,
} from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";
import { cvrCsvColumns } from "~/utils/changelogCsv";
import { ExportCsvButton } from "~/components/ExportCsvButton";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";
import { formatAreaLabel } from "~/utils/areaLabels";
import { CVR_TRANSITIONS } from "~/utils/workflow";
import { useBulkActions } from "~/lib/use-bulk-selection";
import {
  BulkActionBar,
  BulkHeaderCell,
  BulkRowCell,
} from "~/components/BulkActionBar";

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
  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    disciplineFilter,
    setDisciplineFilter,
  } = useListFilters<ChangeStatus>(q);

  // Slim list payload drops `description` / `notes` / `reasonCode`;
  // search by CVR #, title, originator, approver, CBS, area covers the
  // common cases without pulling multi-paragraph text on every visit.
  const matchesFilters = React.useCallback(
    (it: ChangeLogListItem): boolean =>
      matchesListFilters(
        it,
        { search, statusFilter, disciplineFilter },
        {
          status: (i) => i.status,
          discipline: (i) => i.discipline,
          haystack: (i) =>
            `${i.cvrNumber} ${i.title} ${i.originator} ${i.approver} ${i.cbsCodes.join(` `)} ${areaLabel(i.area)}`,
        },
      ),
    [search, statusFilter, disciplineFilter, areaLabel],
  );

  const filtered = React.useMemo(
    () => items.filter(matchesFilters),
    [items, matchesFilters],
  );

  // Bulk selection + actions over the currently-filtered rows.
  const bulk = useBulkActions({
    rows: filtered,
    transitions: CVR_TRANSITIONS,
    entityNoun: "CVR",
    onTransition: (input) => transition.mutateAsync(input),
    onDelete: (id) => remove.mutateAsync(id),
    invalidate,
  });

  const stats = React.useMemo(() => computeCvrStats(items), [items]);

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
    <main className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
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

      <StatCardRow
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
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, CVR, description, CBS…"
            className="pl-7 w-full sm:w-80"
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
            ...DISCIPLINE_FILTER_OPTIONS,
          ]}
        />
        <span className="ml-auto text-xs text-slate-500">
          Showing {filtered.length} of {items.length}
        </span>
        <ExportCsvButton
          getItems={makeFilteredExport(
            queryClient,
            changeLogListFullQueryOptions(projectId),
            matchesFilters,
          )}
          disabled={filtered.length === 0}
          columns={cvrCsvColumns(areaLabel)}
          filenamePrefix="cvr-export"
        />
      </div>

      <BulkActionBar {...bulk.bar} />

      <ChangelogTable
        items={filtered}
        areaLabel={areaLabel}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onTransition={handleTransition}
        {...bulk.table}
      />
    </main>
  );
}

function ChangelogTable({
  items,
  areaLabel,
  onSubmit,
  onDelete,
  onTransition,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
}: {
  items: ChangeLogListItem[];
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertChangeLogInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (next: boolean) => void;
  allSelected: boolean;
  someSelected: boolean;
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
            <BulkHeaderCell
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleAll={onToggleAll}
            />
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
              selected={selected.has(item.id)}
              onToggle={() => onToggle(item.id)}
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
  selected,
  onToggle,
}: {
  item: ChangeLogListItem;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertChangeLogInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
  selected: boolean;
  onToggle: () => void;
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
          <BulkRowCell checked={selected} onToggle={onToggle} />
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

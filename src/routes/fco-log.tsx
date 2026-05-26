import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  HardHat,
  AlertTriangle,
  ArrowUpRight,
  Download,
  Hourglass,
  Link as LinkIcon,
  ListChecks,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import {
  FCO_STATUSES,
  FCO_OPEN_STATUSES,
  fcoListQueryOptions,
  upsertFco,
  deleteFco,
  promoteFcoToCvr,
  transitionFco,
  type FcoItem,
  type FcoStatus,
  type UpsertFcoInput,
} from "~/utils/fcoLog";
import {
  FCO_ORIGIN_LABELS,
  FCO_STATUS_LABELS,
  FcoPriorityBadge,
  FcoStatusBadge,
} from "~/components/FCOLog/FcoBadges";
import { FcoDialog } from "~/components/FCOLog/FcoDialog";
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
import {
  downloadCsv,
  rowsToCsv,
  todayStamp,
  type CsvColumn,
} from "~/lib/csv-export";

/**
 * Column definitions for the CSV export of the FCO log. Module-scope so the
 * column array reference is stable. `areaLabel` is a closure parameter —
 * area resolution depends on the project's loaded area list, which is
 * component-scoped.
 */
const FCO_CSV_COLUMNS = (
  areaLabel: (raw: string) => string,
): CsvColumn<FcoItem>[] => [
  { header: "FCO #", get: (f) => f.fcoNumber },
  { header: "Title", get: (f) => f.title },
  { header: "Status", get: (f) => FCO_STATUS_LABELS[f.status] },
  { header: "Origin", get: (f) => FCO_ORIGIN_LABELS[f.originType] },
  { header: "Priority", get: (f) => f.priority },
  { header: "Discipline", get: (f) => disciplineById[f.discipline]?.label ?? f.discipline },
  { header: "Area", get: (f) => (f.locationArea ? areaLabel(f.locationArea) : "") },
  { header: "Est. Cost ($)", get: (f) => f.estimatedCost },
  { header: "Est. Hours", get: (f) => f.estimatedHours },
  { header: "Work Stopped", get: (f) => (f.workStopped ? "Yes" : "No") },
  { header: "Initiated By", get: (f) => f.initiatedBy },
  { header: "Field Contact", get: (f) => f.fieldContact },
  { header: "CBS Codes", get: (f) => f.cbsCodes.join("; ") },
  { header: "Drawing Refs", get: (f) => f.drawingRefs.join("; ") },
  { header: "RFI Numbers", get: (f) => f.rfiNumbers.join("; ") },
  { header: "Initiated Date", get: (f) => f.initiatedAt.slice(0, 10) },
  { header: "Needed By", get: (f) => f.neededBy?.slice(0, 10) ?? "" },
  { header: "Closed Date", get: (f) => f.closedAt?.slice(0, 10) ?? "" },
  { header: "Linked CVR #", get: (f) => f.linkedCvrNumber ?? "" },
  { header: "Description", get: (f) => f.description },
  { header: "Reason Narrative", get: (f) => f.reasonNarrative },
  { header: "Resolution", get: (f) => f.resolution },
  { header: "Notes", get: (f) => f.notes },
];

export const Route = createFileRoute("/fco-log")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(fcoListQueryOptions(projectId)),
      );
    }
  },
  component: FcoLogPage,
});

function FcoLogPage() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(fcoListQueryOptions(projectId));
  // Areas for label resolution. `locationArea` now holds the area id as a
  // string (matching FefRow.area). Legacy free-text values won't resolve
  // and fall through to displaying the raw string.
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(projectId),
  );
  const areaLabel = React.useCallback(
    (raw: string): string => {
      if (!raw) return "";
      const match = areas.find((a) => String(a.id) === raw);
      if (!match) return raw;
      return match.name ? `${match.displayId} — ${match.name}` : match.displayId;
    },
    [areas],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["fcoLog", projectId] });
    queryClient.invalidateQueries({ queryKey: ["changeLog", projectId] });
    queryClient.invalidateQueries({ queryKey: ["cvrOptions", projectId] });
  };

  const upsert = useMutation({
    mutationFn: (input: UpsertFcoInput) => upsertFco({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteFco({ data: { id } }),
    onSuccess: invalidate,
  });
  const promote = useMutation({
    mutationFn: (id: number) => promoteFcoToCvr({ data: { fcoId: id } }),
    onSuccess: invalidate,
  });
  const transition = useMutation({
    mutationFn: (input: { id: number; action: string }) =>
      transitionFco({ data: input }),
    onSuccess: invalidate,
  });

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | FcoStatus>("");
  const [disciplineFilter, setDisciplineFilter] = React.useState("");
  const [linkageFilter, setLinkageFilter] = React.useState<
    "" | "linked" | "unlinked"
  >("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter && it.status !== statusFilter) return false;
      if (disciplineFilter && it.discipline !== disciplineFilter) return false;
      if (linkageFilter === "linked" && it.linkedCvrId === null) return false;
      if (linkageFilter === "unlinked" && it.linkedCvrId !== null) return false;
      if (q) {
        const haystack =
          `${it.fcoNumber} ${it.title} ${it.description} ${areaLabel(it.locationArea)} ${it.initiatedBy} ${it.reasonNarrative} ${it.cbsCodes.join(" ")} ${it.drawingRefs.join(" ")} ${it.rfiNumbers.join(" ")} ${it.linkedCvrNumber ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, disciplineFilter, linkageFilter, areaLabel]);

  const stats = React.useMemo(() => {
    const openCount = items.filter((i) =>
      FCO_OPEN_STATUSES.includes(i.status),
    ).length;
    const linkedCount = items.filter((i) => i.linkedCvrId !== null).length;
    const urgentCount = items.filter(
      (i) =>
        (i.priority === "URGENT" || i.priority === "HIGH" || i.workStopped) &&
        FCO_OPEN_STATUSES.includes(i.status),
    ).length;
    const workStopped = items.filter(
      (i) => i.workStopped && FCO_OPEN_STATUSES.includes(i.status),
    ).length;
    const totalCost = items.reduce((acc, i) => acc + i.estimatedCost, 0);
    return { openCount, linkedCount, urgentCount, workStopped, totalCost };
  }, [items]);

  const projectScoped = projectId !== null;

  function handleSubmit(input: Omit<UpsertFcoInput, "projectId">) {
    if (!projectScoped) return Promise.resolve();
    return upsert.mutateAsync({ ...input, projectId });
  }

  function handleDelete(id: number) {
    return remove.mutateAsync(id);
  }

  function handlePromote(id: number) {
    return promote.mutateAsync(id);
  }

  function handleTransition(input: { id: number; action: string }) {
    return transition.mutateAsync(input);
  }

  return (
    <main className="p-4 max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <HardHat className="size-6 text-amber-600" />
            Field Change Order (FCO) Log
          </h1>
          <p className="text-sm text-slate-500">
            Track changes originating in the field — RFIs, design conflicts,
            site conditions — and promote them to CVRs in{" "}
            <Link to="/changelog" className="text-red-700 hover:underline">
              Change Log
            </Link>{" "}
            when approved.
          </p>
        </div>
        <FcoDialog
          projectId={projectId}
          trigger={
            <Button disabled={!projectScoped}>
              <Plus className="mr-1 size-4" />
              New FCO
            </Button>
          }
          onSubmit={handleSubmit}
        />
      </div>

      {!projectScoped && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select a project from the header to start logging field changes.
        </p>
      )}

      <FcoStatsCards
        total={items.length}
        openCount={stats.openCount}
        linkedCount={stats.linkedCount}
        urgentCount={stats.urgentCount}
        workStopped={stats.workStopped}
        totalCost={stats.totalCost}
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FCO #, title, drawings, RFIs, CBS…"
            className="pl-7 w-80"
          />
        </div>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as FcoStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            ...FCO_STATUSES.map((s) => ({
              value: s,
              label: FCO_STATUS_LABELS[s],
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
        <span className="ml-auto text-xs text-slate-500">
          Showing {filtered.length} of {items.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0}
          onClick={() => {
            const csv = rowsToCsv(filtered, FCO_CSV_COLUMNS(areaLabel));
            downloadCsv(`fco-export-${todayStamp()}.csv`, csv);
          }}
          title="Export the filtered list to a CSV file (opens in Excel)"
        >
          <Download className="size-3.5 mr-1" />
          Export CSV
        </Button>
      </div>

      <FcoTable
        items={filtered}
        projectId={projectId}
        areaLabel={areaLabel}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onPromote={handlePromote}
        onTransition={handleTransition}
      />
    </main>
  );
}

function FcoStatsCards({
  total,
  openCount,
  linkedCount,
  urgentCount,
  workStopped,
  totalCost,
}: {
  total: number;
  openCount: number;
  linkedCount: number;
  urgentCount: number;
  workStopped: number;
  totalCost: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard label="Total FCOs" value={total.toString()} icon={ListChecks} />
      <StatCard
        label="Open"
        value={openCount.toString()}
        tone="amber"
        icon={Hourglass}
      />
      <StatCard
        label="Urgent / High"
        value={urgentCount.toString()}
        tone="red"
        icon={AlertTriangle}
      />
      <StatCard
        label="Work Stopped"
        value={workStopped.toString()}
        tone={workStopped > 0 ? "red" : "slate"}
        icon={AlertTriangle}
      />
      <StatCard
        label="Linked to CVR"
        value={linkedCount.toString()}
        tone="violet"
        icon={LinkIcon}
      />
      <StatCard
        label="Est. Cost Impact"
        value={`$${formatMoney(totalCost)}`}
        tone={totalCost >= 0 ? "slate" : "red"}
      />
    </div>
  );
}

function FcoTable({
  items,
  projectId,
  areaLabel,
  onSubmit,
  onDelete,
  onPromote,
  onTransition,
}: {
  items: FcoItem[];
  projectId: number | null;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertFcoInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onPromote: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
}) {
  if (items.length === 0) {
    return (
      <TableEmptyState message="No field change orders match the current filters." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>FCO #</Th>
            <Th>Title / Location</Th>
            <Th>Status</Th>
            <Th>Origin</Th>
            <Th>Priority</Th>
            <Th>Discipline</Th>
            <Th className="text-right">Est. Cost</Th>
            <Th className="text-right">Hours</Th>
            <Th>Initiated</Th>
            <Th>CVR Link</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <FcoRow
              key={item.id}
              item={item}
              projectId={projectId}
              areaLabel={areaLabel}
              onSubmit={onSubmit}
              onDelete={onDelete}
              onPromote={onPromote}
              onTransition={onTransition}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FcoRow({
  item,
  projectId,
  areaLabel,
  onSubmit,
  onDelete,
  onPromote,
  onTransition,
}: {
  item: FcoItem;
  projectId: number | null;
  areaLabel: (raw: string) => string;
  onSubmit: (input: Omit<UpsertFcoInput, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onPromote: (id: number) => Promise<unknown>;
  onTransition: (input: { id: number; action: string }) => Promise<unknown>;
}) {
  const disciplineLabel = item.discipline
    ? (disciplineById[item.discipline]?.label ?? item.discipline)
    : "—";
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const rowHighlight = item.workStopped
    ? "bg-red-50/40 hover:bg-red-50"
    : "hover:bg-slate-50";
  return (
    <FcoDialog
      projectId={projectId}
      trigger={
        <tr className={`cursor-pointer transition-colors ${rowHighlight}`}>
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {item.fcoNumber || `#${item.id}`}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
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
          </td>
          <td className={cellCls}>
            <FcoStatusBadge status={item.status} />
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {FCO_ORIGIN_LABELS[item.originType]}
          </td>
          <td className={cellCls}>
            <FcoPriorityBadge priority={item.priority} />
          </td>
          <td className={`${cellCls} text-slate-700`}>{disciplineLabel}</td>
          <td
            className={`${cellCls} text-right tabular-nums ${item.estimatedCost < 0 ? "text-red-600" : "text-slate-700"}`}
          >
            {item.estimatedCost
              ? `$${formatMoney(item.estimatedCost)}`
              : "—"}
          </td>
          <td className={`${cellCls} text-right tabular-nums text-slate-700`}>
            {item.estimatedHours || "—"}
          </td>
          <td className={`${cellCls} text-xs text-slate-500`}>
            <div>{new Date(item.initiatedAt).toLocaleDateString()}</div>
            {item.initiatedBy && (
              <div className="text-slate-400">by {item.initiatedBy}</div>
            )}
          </td>
          <td className={`${cellCls} text-xs`}>
            {item.linkedCvrId ? (
              <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-mono text-violet-700">
                <LinkIcon className="size-3" />
                {item.linkedCvrNumber || `#${item.linkedCvrId}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <ArrowUpRight className="size-3" />
                Not linked
              </span>
            )}
          </td>
        </tr>
      }
      initial={item}
      onSubmit={onSubmit}
      onDelete={onDelete}
      onPromote={onPromote}
      onTransition={onTransition}
    />
  );
}

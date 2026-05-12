import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import {
  changeLogV2ListQueryOptions,
  upsertChangeLogV2,
  deleteChangeLogV2,
  CHANGE_STATUSES,
  type ChangeLogV2Item,
  type ChangeStatus,
  type UpsertChangeLogV2Input,
} from "~/utils/changelogV2";
import {
  RiskBadge,
  StatusBadge,
  STATUS_LABELS,
  TYPE_LABELS,
} from "~/components/ChangelogV2/StatusBadge";
import { ChangelogV2Dialog } from "~/components/ChangelogV2/ChangelogV2Dialog";
import { readProjectIdForLoader } from "~/utils/projectCookie";
import { disciplineById } from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";

export const Route = createFileRoute("/changelog-v2")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await context.queryClient.ensureQueryData(
        changeLogV2ListQueryOptions(projectId),
      );
    }
  },
  component: ChangelogV2Page,
});

const OPEN_STATUSES: ChangeStatus[] = [
  "REQUESTED",
  "IN_REVIEW",
  "PENDING_APPROVAL",
];

function ChangelogV2Page() {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery(changeLogV2ListQueryOptions(projectId));

  const upsert = useMutation({
    mutationFn: (input: UpsertChangeLogV2Input) =>
      upsertChangeLogV2({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changeLogV2", projectId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteChangeLogV2({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changeLogV2", projectId] });
    },
  });

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | ChangeStatus>(
    "",
  );
  const [disciplineFilter, setDisciplineFilter] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter && it.status !== statusFilter) return false;
      if (disciplineFilter && it.discipline !== disciplineFilter) return false;
      if (q) {
        const haystack =
          `${it.cvrNumber} ${it.title} ${it.description} ${it.originator} ${it.approver} ${it.reasonCode} ${it.cbsCodes.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, disciplineFilter]);

  const stats = React.useMemo(() => {
    const totalCost = items.reduce((acc, i) => acc + i.costImpact, 0);
    const approvedCost = items
      .filter((i) => i.status === "APPROVED" || i.status === "EXECUTED")
      .reduce((acc, i) => acc + i.costImpact, 0);
    const openCount = items.filter((i) =>
      OPEN_STATUSES.includes(i.status),
    ).length;
    const executedCount = items.filter((i) => i.status === "EXECUTED").length;
    return { totalCost, approvedCost, openCount, executedCount };
  }, [items]);

  const projectScoped = projectId !== null;

  function handleSubmit(input: Omit<UpsertChangeLogV2Input, "projectId">) {
    if (!projectScoped) return Promise.resolve();
    return upsert.mutateAsync({ ...input, projectId });
  }

  function handleDelete(id: number) {
    return remove.mutateAsync(id);
  }

  return (
    <main className="p-4 max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Change Log V2</h1>
          <p className="text-sm text-slate-500">
            CVRs, scope changes, and cost variations for the current project
          </p>
        </div>
        <ChangelogV2Dialog
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
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select a project from the header to start logging changes.
        </p>
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
      </div>

      <ChangelogV2Table
        items={filtered}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
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

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber" | "emerald" | "violet" | "red";
}) {
  const toneClass = {
    slate: "text-slate-800",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    violet: "text-violet-700",
    red: "text-red-700",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-slate-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border border-input bg-white px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChangelogV2Table({
  items,
  onSubmit,
  onDelete,
}: {
  items: ChangeLogV2Item[];
  onSubmit: (input: Omit<UpsertChangeLogV2Input, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        No change items match the current filters.
      </div>
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
            <Th>Risk</Th>
            <Th className="text-right">Cost $</Th>
            <Th className="text-right">Sched (d)</Th>
            <Th className="text-right">Hours</Th>
            <Th>Requested</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ChangelogV2Row
              key={item.id}
              item={item}
              onSubmit={onSubmit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 border-b border-slate-200 ${className}`}>
      {children}
    </th>
  );
}

function ChangelogV2Row({
  item,
  onSubmit,
  onDelete,
}: {
  item: ChangeLogV2Item;
  onSubmit: (input: Omit<UpsertChangeLogV2Input, "projectId">) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const disciplineLabel = item.discipline
    ? (disciplineById[item.discipline]?.label ?? item.discipline)
    : "—";
  const cellCls = "px-3 py-2 border-b border-slate-100";
  return (
    <ChangelogV2Dialog
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
          <td className={cellCls}>
            <RiskBadge level={item.riskLevel} />
          </td>
          <td
            className={`${cellCls} text-right tabular-nums ${item.costImpact < 0 ? "text-red-600" : "text-slate-700"}`}
          >
            {item.costImpact ? `$${formatMoney(item.costImpact)}` : "—"}
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
    />
  );
}

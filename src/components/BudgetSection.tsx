import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Scale } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import {
  budgetReconciliationQueryOptions,
  type BudgetReconciliationDisciplineRow,
  type BudgetReconciliationL1Row,
} from "~/utils/reporting";
import type { BudgetReconciliationRow } from "~/lib/budget-reconciliation";
import { snapshotsQueryOptions } from "~/utils/snapshots";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { disciplineForL1 } from "~/utils/cvr-bucket";
import { formatCurrency, formatSignedCurrency } from "~/lib/formatting";
import { QueryError } from "~/components/ui/list-page";

/**
 * "Current Budget & Forecast" panel for the Summary page — the living-budget
 * waterfall: as-bid estimate → + approved CVRs → current budget → + weighted
 * trends → AFC, per discipline (expandable to CBS L1 accounts) with a grand
 * total. Baseline is a chosen snapshot (default: latest; live estimate when
 * none). All math comes from `fetchBudgetReconciliation`.
 */
export function BudgetSection() {
  const { projectId } = useSelectedProject();
  const [snapshotId, setSnapshotId] = React.useState<number | null>(null);
  const { data: snapshots = [] } = useQuery(snapshotsQueryOptions(projectId));
  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery(budgetReconciliationQueryOptions(projectId, snapshotId));
  const { data: liveTotals } = useQuery(
    projectFefRowTotalsQueryOptions(projectId),
  );

  // Group the L1 rows under the discipline the server rolled them into, so a
  // discipline can expand to show which accounts moved.
  const l1ByDiscipline = React.useMemo(() => {
    const map = new Map<string, BudgetReconciliationL1Row[]>();
    for (const row of data?.byL1 ?? []) {
      const disc = disciplineForL1(row.bucket);
      const list = map.get(disc) ?? [];
      list.push(row);
      map.set(disc, list);
    }
    return map;
  }, [data]);

  // Live working-estimate total (labor + materials by L1) for the
  // as-bid-vs-working delta. Same metric `bacByL1` sums on the server.
  const workingTotal = React.useMemo(() => {
    if (!liveTotals) return null;
    let n = 0;
    for (const v of Object.values(liveTotals.laborByL1)) n += v;
    for (const v of Object.values(liveTotals.materialsByL1)) n += v;
    return n;
  }, [liveTotals]);

  if (projectId === null) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Scale className="size-5 text-slate-500" />
            Current Budget &amp; Forecast
          </h2>
          <p className="text-xs text-slate-500 max-w-prose">
            As-bid estimate + approved CVRs = current budget; + probability-
            weighted trends = anticipated final cost (AFC). Reconciled by CBS
            account. <span className="text-slate-400">Pending</span> = open CVRs
            in the approval pipeline (full cost, not yet in the budget).
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-sm shrink-0">
          <span className="text-slate-500">Baseline:</span>
          <select
            value={snapshotId ?? ""}
            onChange={(e) =>
              setSnapshotId(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-8 rounded-md border border-input bg-white px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
          >
            <option value="">Latest snapshot</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isError ? (
        <QueryError error={error} label="budget reconciliation" />
      ) : isPending || !data ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : data.byDiscipline.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          Nothing to reconcile yet — add take-off rows and approve a CVR, or
          create an as-bid snapshot to set the baseline.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">
            Baseline:{" "}
            <span className="font-medium text-slate-700">
              {data.baselineLabel ?? "live estimate (no snapshot)"}
            </span>
            {workingTotal !== null &&
              data.baselineSnapshotId !== null &&
              Math.round(workingTotal) !== Math.round(data.total.asBid) && (
                <>
                  {" · working estimate now "}
                  <span className="font-medium text-slate-700">
                    {formatCurrency(workingTotal)}
                  </span>
                  <span className="text-slate-400">
                    {" ("}
                    {formatSignedCurrency(workingTotal - data.total.asBid)} vs
                    as-bid)
                  </span>
                </>
              )}
          </p>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-right">As-bid</th>
                  <th className="px-3 py-2 text-right">+ Approved</th>
                  <th className="px-3 py-2 text-right">= Current Budget</th>
                  <th className="px-3 py-2 text-right">Pending</th>
                  <th className="px-3 py-2 text-right">+ Trend (wtd)</th>
                  <th className="px-3 py-2 text-right">= AFC</th>
                </tr>
              </thead>
              <tbody>
                {data.byDiscipline.map((row) => (
                  <DisciplineRows
                    key={row.bucket || "unattributed"}
                    row={row}
                    l1Rows={l1ByDiscipline.get(row.bucket) ?? []}
                  />
                ))}
              </tbody>
              <tfoot>
                <BudgetRow
                  label="Total"
                  row={data.total}
                  emphasis
                />
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** A discipline row plus its expandable L1 children. */
function DisciplineRows({
  row,
  l1Rows,
}: {
  row: BudgetReconciliationDisciplineRow;
  l1Rows: BudgetReconciliationL1Row[];
}) {
  const [open, setOpen] = React.useState(false);
  const expandable = l1Rows.length > 0;
  const label = row.disciplineLabel || "Unattributed";
  return (
    <>
      <BudgetRow
        label={label}
        row={row}
        expandable={expandable}
        open={open}
        onToggle={expandable ? () => setOpen((o) => !o) : undefined}
      />
      {open &&
        l1Rows.map((l1) => (
          <BudgetRow
            key={l1.bucket || "unattributed-l1"}
            label={l1Label(l1)}
            row={l1}
            indent
          />
        ))}
    </>
  );
}

/** "611 — High Alloy SS…" when the L1 has a CBS account name; "Unattributed"
 *  for the "" bucket; and "<code> — not in CBS catalog" for a code that has no
 *  catalog match (an ad-hoc / invalid CVR code), so a nameless row reads as a
 *  data issue rather than a missing label. */
function l1Label(row: BudgetReconciliationL1Row): string {
  if (!row.bucket) return "Unattributed";
  return row.name
    ? `${row.bucket} — ${row.name}`
    : `${row.bucket} — not in CBS catalog`;
}

function BudgetRow({
  label,
  row,
  emphasis = false,
  expandable = false,
  open = false,
  onToggle,
  indent = false,
}: {
  label: string;
  row: BudgetReconciliationRow;
  emphasis?: boolean;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
  indent?: boolean;
}) {
  const base = emphasis
    ? "border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800"
    : indent
      ? "border-t border-slate-100 bg-slate-50/40 text-slate-600"
      : "border-t border-slate-100 text-slate-700";
  return (
    <tr
      className={`${base} ${onToggle ? "cursor-pointer hover:bg-slate-50" : ""}`}
      onClick={onToggle}
    >
      <td className={`px-3 py-2 ${indent ? "pl-9 font-mono text-xs" : ""}`}>
        <span className="inline-flex items-center gap-1">
          {expandable && (
            <ChevronRight
              className={`size-3.5 text-slate-400 transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
          )}
          {label}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {fmt(row.asBid)}
      </td>
      <DeltaTd value={row.approvedChange} />
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        {fmt(row.currentBudget)}
      </td>
      <DeltaTd value={row.pendingChange} />
      <DeltaTd value={row.weightedTrend} />
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        {fmt(row.afc)}
      </td>
    </tr>
  );
}

/** Right-aligned signed-currency cell for the change columns; 0 shows "—". */
function DeltaTd({ value }: { value: number }) {
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${
        value > 0
          ? "text-amber-700"
          : value < 0
            ? "text-emerald-700"
            : "text-slate-400"
      }`}
    >
      {value === 0 ? "—" : formatSignedCurrency(value)}
    </td>
  );
}

/** Totals/budget columns: 0 renders as "—" so the eye lands on real figures. */
function fmt(n: number): string {
  return n === 0 ? "—" : formatCurrency(n);
}

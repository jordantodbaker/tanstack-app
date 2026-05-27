import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { latestPeriodWithEvmQueryOptions } from "~/utils/reporting";
import { formatCurrency } from "~/lib/formatting";
import { QueryError } from "~/components/ui/list-page";

/**
 * Dashboard EVM card. Shows the headline numbers from the latest reporting
 * period for the current project. Hidden when no period exists yet so the
 * dashboard stays clean for projects that haven't started reporting.
 */
export function EvmDashboardCard() {
  const { projectId } = useSelectedProject();
  const { data: period, isError, error } = useQuery(
    latestPeriodWithEvmQueryOptions(projectId),
  );

  if (projectId === null) return null;
  if (isError) {
    // Surface real errors rather than rendering as a blank "no period" state —
    // an EVM card that silently disappears on failure hides bugs (e.g. a stale
    // Prisma client missing the snapshot `totals` column).
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
          <LineChart className="size-4 text-slate-400" />
          Earned Value
        </h3>
        <QueryError error={error} label="EVM card" />
      </div>
    );
  }
  if (period === null) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <LineChart className="size-4 text-slate-400" />
              Earned Value
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              No reporting periods yet. Create one to see CPI / SPI / EAC for
              this project.
            </p>
          </div>
          <Link
            to="/reporting"
            className="text-xs text-red-700 hover:underline shrink-0"
          >
            Open Reporting →
          </Link>
        </div>
      </div>
    );
  }
  if (!period) return null; // loading

  const { total } = period;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <LineChart className="size-4 text-slate-400" />
            Earned Value — {period.label}
          </h3>
          <p className="text-xs text-slate-500">
            Data date {new Date(period.dataDate).toLocaleDateString()} ·
            baseline {period.baselineLabel}
          </p>
        </div>
        <Link
          to="/reporting"
          className="text-xs text-red-700 hover:underline shrink-0"
        >
          Open Reporting →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Metric label="BAC" value={formatCurrency(total.bac)} />
        <Metric label="EV" value={formatCurrency(total.ev)} />
        <Metric label="AC" value={formatCurrency(total.ac)} />
        <IndexMetric label="CPI" value={total.cpi} />
        <IndexMetric label="SPI" value={total.spi} />
        <Metric
          label="EAC"
          value={formatCurrency(total.eac)}
          tone={total.vac < 0 ? "red" : "slate"}
        />
      </div>

      {/* AFC strip — only renders when there's a pending-trend signal, so the
          card stays the same height for projects without a trend log. */}
      {total.pendingTrend > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-3">
          <Metric
            label="Pending trend"
            value={formatCurrency(total.pendingTrend)}
            tone="red"
          />
          <Metric
            label="AFC"
            value={formatCurrency(total.afc)}
            tone={total.vafc < 0 ? "red" : "slate"}
          />
          <Variance label="VAFC" value={total.vafc} />
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Variance label="CV" value={total.cv} />
        <Variance label="SV" value={total.sv} />
        <Variance label="VAC" value={total.vac} />
        <span className="text-slate-500">
          ETC <span className="tabular-nums text-slate-700">{formatCurrency(total.etc)}</span>
        </span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "red" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-700"
      : tone === "green"
        ? "text-emerald-700"
        : "text-slate-800";
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function IndexMetric({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value === null) {
    return <Metric label={label} value="—" />;
  }
  const tone = value >= 1 ? "green" : "red";
  const Icon = value >= 1 ? TrendingUp : TrendingDown;
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums flex items-center gap-1 ${
          tone === "green" ? "text-emerald-700" : "text-red-700"
        }`}
      >
        <Icon className="size-3.5" />
        {value.toFixed(2)}
      </p>
    </div>
  );
}

function Variance({ label, value }: { label: string; value: number }) {
  const tone =
    value === 0 || !Number.isFinite(value)
      ? "text-slate-700"
      : value > 0
        ? "text-emerald-700"
        : "text-red-700";
  return (
    <span className="text-slate-500">
      {label}{" "}
      <span className={`tabular-nums font-semibold ${tone}`}>
        {value > 0 ? "+" : ""}
        {formatCurrency(value)}
      </span>
    </span>
  );
}


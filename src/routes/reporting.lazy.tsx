import { createLazyFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { LineChart, Trash2 } from "lucide-react";
import { qk } from "~/lib/query-keys";
import { Button } from "~/components/ui/button";
import { useSelectedProject } from "~/lib/selected-project";
import {
  deleteReportingPeriod,
  periodWithEvmQueryOptions,
  reportingPeriodsQueryOptions,
  type PeriodWithEvm,
} from "~/utils/reporting";
import { EvmSCurve } from "~/components/EvmSCurve";
import { useIsAdmin } from "~/lib/use-current-user";
import { TableEmptyState } from "~/components/ui/list-page";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";
import { formatShortDate } from "~/lib/dates";
import {
  EvmGlossary,
  EvmTable,
  ProjectTotalRow,
} from "~/components/Reporting/EvmPeriodTable";
import { NewPeriodDialog } from "~/components/Reporting/NewPeriodDialog";

export const Route = createLazyFileRoute("/reporting")({
  component: ReportingPage,
});

function ReportingPage() {
  const { projectId } = useSelectedProject();
  const { data: periods = [] } = useQuery(
    reportingPeriodsQueryOptions(projectId),
  );
  // Default the selected period to the latest (first in desc list).
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (selectedId === null && periods.length > 0) {
      setSelectedId(periods[0].id);
    }
    if (
      selectedId !== null &&
      !periods.some((p) => p.id === selectedId)
    ) {
      // Selected period was deleted — reset to the next-latest.
      setSelectedId(periods[0]?.id ?? null);
    }
  }, [periods, selectedId]);

  return (
    <main className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LineChart className="size-6 text-red-700" />
            Project Reporting
          </h1>
          <p className="text-sm text-slate-500">
            Earned-value periods: measure progress against a baseline snapshot,
            roll up CPI/SPI/EAC across discipline buckets.
          </p>
        </div>
        {projectId !== null && <NewPeriodDialog projectId={projectId} />}
      </div>

      {projectId === null ? (
        <SelectProjectBanner>
          Select a project from the header to manage reporting periods.
        </SelectProjectBanner>
      ) : periods.length === 0 ? (
        <TableEmptyState message="No reporting periods yet. Click New Period to create one." />
      ) : (
        <>
          <EvmSCurve />
          <PeriodPicker
            periods={periods}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selectedId !== null && (
            <PeriodDetail key={selectedId} periodId={selectedId} />
          )}
        </>
      )}
    </main>
  );
}

function PeriodPicker({
  periods,
  selectedId,
  onSelect,
}: {
  periods: Array<{
    id: number;
    label: string;
    dataDate: string;
    baselineLabel: string;
    measurementCount: number;
  }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    // Capped height with scroll so the picker doesn't dominate the viewport
    // when many periods have been created (mobile in particular — each card
    // is two lines tall so 5+ periods push the EVM table well below the fold).
    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
      {periods.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              active
                ? "border-red-700 bg-red-50 text-red-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <div className="font-medium">{p.label}</div>
            <div className="text-xs text-slate-500">
              {formatShortDate(p.dataDate)} ·{" "}
              {p.baselineLabel} · {p.measurementCount} measurements
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PeriodDetail({ periodId }: { periodId: number }) {
  const { data: period, isPending, isError, error } = useQuery(
    periodWithEvmQueryOptions(periodId),
  );
  if (isError) {
    return (
      <p className="text-sm text-red-700 rounded border border-red-200 bg-red-50 px-3 py-2">
        Couldn't load period:{" "}
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }
  if (isPending || !period) {
    return <p className="text-sm text-slate-500">Loading period…</p>;
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {period.label}
          </h2>
          <p className="text-xs text-slate-500">
            Data date {formatShortDate(period.dataDate)} ·
            baseline {period.baselineLabel}
            {(!period.projectStartDate || !period.projectEndDate) && (
              <span className="text-amber-700">
                {" · "}Project start/end not set — time-linear PV unavailable
                (set in Admin → Projects)
              </span>
            )}
          </p>
        </div>
        <DeletePeriodButton period={period} />
      </div>

      <EvmGlossary />
      <EvmTable period={period} />
      <ProjectTotalRow total={period.total} />
    </section>
  );
}

function DeletePeriodButton({ period }: { period: PeriodWithEvm }) {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const remove = useMutation({
    mutationFn: () => deleteReportingPeriod({ data: { id: period.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.reporting.periods(period.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.latestPeriodWithEvm(period.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.evmTimeSeries(period.projectId),
      });
    },
  });
  // Period creator info isn't on PeriodWithEvm; the list view has it, so we
  // optimistically allow delete for admin only here (creator delete is still
  // available via the list-level UI if added later). For v1 simplicity:
  // admins can delete from this surface, everyone else uses the period list.
  if (!isAdmin) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={remove.isPending}
      onClick={() => {
        if (
          confirm(
            `Delete period "${period.label}"? Measurements will be removed too.`,
          )
        ) {
          remove.mutate();
        }
      }}
      className="text-red-600 hover:bg-red-50"
    >
      <Trash2 className="size-3.5 mr-1" />
      Delete
    </Button>
  );
}

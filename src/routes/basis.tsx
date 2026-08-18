import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useSelectedVersion } from "~/lib/selected-version";
import { logger } from "~/lib/logger";
import { FEF_DISCIPLINES } from "~/config/disciplines";
import {
  basisInputsQueryOptions,
  saveBasisInputs,
  type BasisManpower,
  type BasisMilestone,
} from "~/utils/basisInputs";

export const Route = createFileRoute("/basis")({
  component: BasisPage,
});

const MILESTONE_EVENTS = [
  "Assess",
  "Select",
  "Define",
  "Detailed Engineering",
  "Construction",
  "Commissioning",
  "Closeout",
];

const SAVE_DEBOUNCE_MS = 500;

function diffDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  const ms = e.getTime() - s.getTime();
  return Math.round(ms / 86400000);
}

/**
 * One row per canonical milestone event, filled in from whatever was saved for
 * that event. Merging by name (rather than trusting the stored array) keeps the
 * Event column populated when the persisted JSON is stale — e.g. rows from the
 * pre-rename `{ label, date }` shape, which carry no `event` at all.
 */
function milestoneRows(saved: BasisMilestone[]): BasisMilestone[] {
  const byEvent = new Map(
    (saved ?? [])
      .filter((row) => row && typeof row.event === "string")
      .map((row) => [row.event, row]),
  );
  return MILESTONE_EVENTS.map((event) => {
    const row = byEvent.get(event);
    return {
      event,
      startDate: row?.startDate ?? "",
      endDate: row?.endDate ?? "",
    };
  });
}

const MANPOWER_DISCIPLINE_LABELS: Record<string, string> = Object.fromEntries(
  FEF_DISCIPLINES.map((d) => [d.id, d.label]),
);

/**
 * One manpower row per take-off discipline, reusing whatever was saved for that
 * discipline id. Keying by id (not row order) means the table picks up new
 * disciplines and drops retired ones without stranding the entered numbers.
 */
function manpowerRows(saved: BasisManpower[]): BasisManpower[] {
  const byDiscipline = new Map(saved.map((row) => [row.discipline, row]));
  return FEF_DISCIPLINES.map(
    (d) =>
      byDiscipline.get(d.id) ?? {
        discipline: d.id,
        durationWeeks: "",
        avgHeadcount: "",
      },
  );
}

/** Total headcount = duration (weeks) × average headcount. */
function totalHeadcount(row: BasisManpower): number | null {
  const weeks = Number(row.durationWeeks);
  const avg = Number(row.avgHeadcount);
  if (!row.durationWeeks || !row.avgHeadcount) return null;
  if (!Number.isFinite(weeks) || !Number.isFinite(avg)) return null;
  return weeks * avg;
}

function formatHeadcount(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function ManpowerTable({
  rows,
  setRows,
}: {
  rows: BasisManpower[];
  setRows: React.Dispatch<React.SetStateAction<BasisManpower[]>>;
}) {
  function updateRow(
    index: number,
    field: "durationWeeks" | "avgHeadcount",
    value: string,
  ) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  const grandTotal = rows.reduce((sum, row) => sum + (totalHeadcount(row) ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
              Discipline
            </th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
              Duration (Weeks)
            </th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
              Average Headcount
            </th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
              Total Headcount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const total = totalHeadcount(row);
            return (
              <tr
                key={row.discipline}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="border border-gray-300 px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                  {MANPOWER_DISCIPLINE_LABELS[row.discipline] ?? row.discipline}
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.durationWeeks}
                    onChange={(e) => updateRow(i, "durationWeeks", e.target.value)}
                    placeholder="0"
                    className="w-full px-2 py-1 text-sm text-right tabular-nums bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                  />
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.avgHeadcount}
                    onChange={(e) => updateRow(i, "avgHeadcount", e.target.value)}
                    placeholder="0"
                    className="w-full px-2 py-1 text-sm text-right tabular-nums bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                  />
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600">
                  {total !== null ? formatHeadcount(total) : ""}
                </td>
              </tr>
            );
          })}
          <tr className="bg-gray-100 font-semibold">
            <td className="border border-gray-300 px-3 py-2 text-slate-700">Total</td>
            <td className="border border-gray-300 px-3 py-2" />
            <td className="border border-gray-300 px-3 py-2" />
            <td className="border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-700">
              {grandTotal > 0 ? formatHeadcount(grandTotal) : ""}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MilestoneTable({
  rows,
  setRows,
}: {
  rows: BasisMilestone[];
  setRows: React.Dispatch<React.SetStateAction<BasisMilestone[]>>;
}) {
  function updateRow(index: number, field: "startDate" | "endDate", value: string) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, [field]: value };
        if (field === "startDate" && updated.endDate && updated.endDate < value) {
          updated.endDate = value;
        }
        if (field === "endDate" && updated.startDate && value < updated.startDate) {
          return row;
        }
        return updated;
      }),
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Event</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Start Date</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">End Date</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Days</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Weeks</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Months</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const days = diffDays(row.startDate, row.endDate);
            const weeks = days !== null ? (days / 7).toFixed(1) : "";
            const months = days !== null ? (days / 30.4375).toFixed(1) : "";
            return (
              <tr key={row.event} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-300 px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                  {row.event}
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="date"
                    value={row.startDate}
                    onChange={(e) => updateRow(i, "startDate", e.target.value)}
                    max={row.endDate || undefined}
                    className="w-full px-2 py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                  />
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="date"
                    value={row.endDate}
                    onChange={(e) => updateRow(i, "endDate", e.target.value)}
                    min={row.startDate || undefined}
                    className="w-full px-2 py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                  />
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600">
                  {days !== null ? days : ""}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600">
                  {weeks}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600">
                  {months}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BasisPage() {
  const { versionId } = useSelectedVersion();
  const queryClient = useQueryClient();
  const queryOpts = basisInputsQueryOptions(versionId);
  const { data: loaded } = useQuery(queryOpts);

  const [estimateFactor, setEstimateFactor] = React.useState("");
  const [compositeLaborRate, setCompositeLaborRate] = React.useState("");
  const [milestones, setMilestones] = React.useState<BasisMilestone[]>(() =>
    milestoneRows([]),
  );
  const [manpower, setManpower] = React.useState<BasisManpower[]>(() =>
    manpowerRows([]),
  );

  const hydratedKeyRef = React.useRef<number | null>(null);
  const skipNextSaveRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (versionId === null) return;
    if (loaded === undefined) return;
    if (hydratedKeyRef.current === versionId) return;

    skipNextSaveRef.current = true;
    setEstimateFactor(loaded.estimateFactor);
    setCompositeLaborRate(loaded.compositeLaborRate);
    setMilestones(milestoneRows(loaded.milestones));
    setManpower(manpowerRows(loaded.manpower));
    hydratedKeyRef.current = versionId;
  }, [versionId, loaded]);

  React.useEffect(() => {
    if (versionId === null) return;
    if (hydratedKeyRef.current !== versionId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const payload = { estimateFactor, compositeLaborRate, milestones, manpower };
    saveTimerRef.current = setTimeout(() => {
      saveBasisInputs({ data: { versionId, payload } })
        .then(() => {
          queryClient.setQueryData(["basisInputs", versionId], payload);
        })
        .catch((err) =>
          logger.error("basis save failed", { versionId, err }),
        );
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    versionId,
    estimateFactor,
    compositeLaborRate,
    milestones,
    manpower,
    queryClient,
  ]);

  return (
    <main className="p-4 max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold">Basis</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">
          Estimate Rates &amp; Factors
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="estimate-factor">Estimate Factor / Basis</Label>
            <Input
              id="estimate-factor"
              type="number"
              step="any"
              value={estimateFactor}
              onChange={(e) => setEstimateFactor(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="composite-labor-rate">Composite Labor Rate</Label>
            <Input
              id="composite-labor-rate"
              type="number"
              step="any"
              value={compositeLaborRate}
              onChange={(e) => setCompositeLaborRate(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">
          Schedule Information / Milestones
        </h2>
        <MilestoneTable rows={milestones} setRows={setMilestones} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">
          Manpower
        </h2>
        <ManpowerTable rows={manpower} setRows={setManpower} />
      </section>
    </main>
  );
}

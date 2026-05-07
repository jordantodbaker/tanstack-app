import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useSelectedProject } from "~/lib/selected-project";
import {
  basisInputsQueryOptions,
  saveBasisInputs,
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

function blankMilestones(): BasisMilestone[] {
  return MILESTONE_EVENTS.map((event) => ({
    event,
    startDate: "",
    endDate: "",
  }));
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
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const queryOpts = basisInputsQueryOptions(projectId);
  const { data: loaded } = useQuery(queryOpts);

  const [estimateFactor, setEstimateFactor] = React.useState("");
  const [compositeLaborRate, setCompositeLaborRate] = React.useState("");
  const [milestones, setMilestones] = React.useState<BasisMilestone[]>(
    blankMilestones,
  );

  const hydratedKeyRef = React.useRef<number | null>(null);
  const skipNextSaveRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (projectId === null) return;
    if (loaded === undefined) return;
    if (hydratedKeyRef.current === projectId) return;

    skipNextSaveRef.current = true;
    setEstimateFactor(loaded.estimateFactor);
    setCompositeLaborRate(loaded.compositeLaborRate);
    setMilestones(
      loaded.milestones.length > 0 ? loaded.milestones : blankMilestones(),
    );
    hydratedKeyRef.current = projectId;
  }, [projectId, loaded]);

  React.useEffect(() => {
    if (projectId === null) return;
    if (hydratedKeyRef.current !== projectId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const payload = { estimateFactor, compositeLaborRate, milestones };
    saveTimerRef.current = setTimeout(() => {
      saveBasisInputs({ data: { projectId, payload } })
        .then(() => {
          queryClient.setQueryData(["basisInputs", projectId], payload);
        })
        .catch((err) => console.error("Failed to save basis inputs", err));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    projectId,
    estimateFactor,
    compositeLaborRate,
    milestones,
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
    </main>
  );
}

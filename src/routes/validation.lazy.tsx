import { createLazyFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SUMMARY_DISCIPLINES } from "~/config/disciplines";
import { formatMoney, formatShare } from "~/lib/formatting";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import { Checkbox } from "~/components/ui/checkbox";
import { Textarea } from "~/components/ui/textarea";
import {
  DEVELOPMENT_DOC_ITEMS,
  ESTIMATE_READINESS_ITEMS,
} from "~/config/development-docs";
import {
  devDocChecklistQueryOptions,
  saveDevDocChecklist,
} from "~/utils/devDocs";
import { logger } from "~/lib/logger";
import { DonutChart, type DonutSlice } from "~/components/charts/DonutChart";
import { DisciplineAreaRelationships } from "~/components/Validation/DisciplineAreaRelationships";
import {
  DISC_COLOR,
  DISCIPLINE_COLORS_BY_DIGIT,
  INDI_COLOR,
  MATERIAL_COLOR,
} from "~/components/Validation/validation-colors";

export const Route = createLazyFileRoute("/validation")({
  component: ValidationPage,
});

// ── page ─────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>
        {value > 0 ? `$${formatMoney(value)}` : "—"}
      </p>
    </div>
  );
}

function ValidationPage() {
  const { projectId } = useSelectedProject();
  const { versionId } = useSelectedVersion();
  const { data: dbTotals } = useQuery(
    projectFefRowTotalsQueryOptions(versionId),
  );
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(projectId),
  );

  const disciplineData = SUMMARY_DISCIPLINES.map(({ label, digit }) => {
    const labor = digit !== null ? (dbTotals?.laborByDigit[digit] ?? 0) : 0;
    const material =
      digit !== null ? (dbTotals?.materialsByDigit[digit] ?? 0) : 0;
    return { label, digit, labor, material, total: labor + material };
  });

  const disciplinesTotal = disciplineData.reduce((acc, d) => acc + d.total, 0);
  const craftSupportTotal = dbTotals?.craftSupportLabor ?? 0;
  const indirectsTotal = craftSupportTotal;
  const grandTotal = disciplinesTotal + indirectsTotal;

  const maxBar = Math.max(...disciplineData.map((d) => d.total), indirectsTotal, 1);

  const donutSlices: DonutSlice[] = [
    { label: "Disciplines", value: disciplinesTotal, color: DISC_COLOR },
    { label: "Indirects", value: indirectsTotal, color: INDI_COLOR },
  ];

  const disciplineDonutSlices: DonutSlice[] = disciplineData
    .map((d) => ({
      label: d.label,
      value: d.total,
      color:
        (d.digit !== null && DISCIPLINE_COLORS_BY_DIGIT[d.digit]) || "#94a3b8",
    }))
    .filter((s) => s.value > 0);

  return (
    <main className="p-4 max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Validation</h1>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Disciplines Total Cost" value={disciplinesTotal} color={DISC_COLOR} />
        <StatCard label="Indirects Total Cost" value={indirectsTotal} color={INDI_COLOR} />
        <StatCard label="Grand Total" value={grandTotal} color="#111827" />
      </div>

      <Accordion
        type="multiple"
        defaultValue={[
          "disc-vs-indirect",
          "distribution",
          "breakdown",
          "relationships",
          "validation",
        ]}
      >
        {/* ── Metrics ── */}
        <AccordionItem value="disc-vs-indirect">
          <AccordionTrigger>Disciplines vs. Indirects</AccordionTrigger>
          <AccordionContent>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-10">
          <DonutChart slices={donutSlices} total={grandTotal} />
          <div className="space-y-5 min-w-48">
            {donutSlices.map(({ label, value, color }) => {
              const pct = formatShare(value, grandTotal);
              return (
                <div key={label} className="flex items-start gap-3">
                  <span
                    className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {label}
                    </p>
                    <p className="text-sm text-slate-500">
                      {value > 0 ? `$${formatMoney(value)}` : "—"}
                    </p>
                    <p className="text-xs text-slate-400">{pct} of total</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="distribution">
          <AccordionTrigger>Discipline Distribution</AccordionTrigger>
          <AccordionContent>
        <p className="text-sm text-slate-500 mb-5">
          Share of total discipline cost by discipline
        </p>
        {disciplineDonutSlices.length === 0 ? (
          <p className="text-sm text-slate-400">
            No discipline cost data recorded yet.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-10">
            <DonutChart
              slices={disciplineDonutSlices}
              total={disciplinesTotal}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 flex-1">
              {disciplineDonutSlices.map(({ label, value, color }) => {
                const pct = formatShare(value, disciplinesTotal);
                return (
                  <div key={label} className="flex items-start gap-3">
                    <span
                      className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {label}
                      </p>
                      <p className="text-sm text-slate-500 tabular-nums">
                        ${formatMoney(value)}
                      </p>
                      <p className="text-xs text-slate-400">{pct}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="breakdown">
          <AccordionTrigger>Discipline Breakdown</AccordionTrigger>
          <AccordionContent>
        <p className="text-sm text-slate-500 mb-5">
          Labor and material costs per discipline
        </p>
        {disciplinesTotal === 0 && indirectsTotal === 0 ? (
          <p className="text-sm text-slate-400">
            No cost data recorded yet. Enter labor hours, rates, and material
            costs on the discipline pages.
          </p>
        ) : (
          <div className="space-y-3">
            {[
              ...disciplineData.filter((d) => d.total > 0),
              ...(indirectsTotal > 0
                ? [
                    {
                      label: "Craft Support Labor (Indirect)",
                      labor: craftSupportTotal,
                      material: 0,
                      total: craftSupportTotal,
                    },
                  ]
                : []),
            ].map((d) => {
              const isIndirect = d.label.includes("Indirect");
              const laborWidth = (d.labor / maxBar) * 100;
              const materialWidth = (d.material / maxBar) * 100;
              return (
                <div key={d.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span
                      className="font-medium"
                      style={{ color: isIndirect ? INDI_COLOR : "#374151" }}
                    >
                      {d.label}
                    </span>
                    <span className="text-slate-500 tabular-nums">
                      ${formatMoney(d.total)}
                    </span>
                  </div>
                  <div className="flex h-5 w-full overflow-hidden rounded bg-slate-100">
                    {d.labor > 0 && (
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${laborWidth}%`,
                          background: isIndirect ? INDI_COLOR : DISC_COLOR,
                        }}
                        title={`Labor: $${formatMoney(d.labor)}`}
                      />
                    )}
                    {d.material > 0 && (
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${materialWidth}%`,
                          background: MATERIAL_COLOR,
                        }}
                        title={`Material: $${formatMoney(d.material)}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-5 pt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: DISC_COLOR }}
                />
                Discipline Labor
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: MATERIAL_COLOR }}
                />
                Material
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: INDI_COLOR }}
                />
                Indirect Labor
              </span>
            </div>
          </div>
        )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="relationships">
          <AccordionTrigger>Discipline &times; Area Relationships</AccordionTrigger>
          <AccordionContent>
            <DisciplineAreaRelationships
              byArea={dbTotals?.byArea ?? []}
              areas={areas}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── Validation ── */}
        <AccordionItem value="validation">
          <AccordionTrigger>Validation</AccordionTrigger>
          <AccordionContent>
            <ValidationSection versionId={versionId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}

/**
 * The Validation accordion section, persisted per estimate version: the
 * "Documentation for Development" checkbox group plus the Escalation and
 * Contingency free-text notes. Mirrors the basis page's debounced-save pattern —
 * hydrate local state once per version, then save (debounced) on change;
 * `invalidate`-free because the writer owns the cache via setQueryData.
 */
function ValidationSection({ versionId }: { versionId: number | null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(devDocChecklistQueryOptions(versionId));

  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [escalation, setEscalation] = React.useState("");
  const [contingency, setContingency] = React.useState("");
  const hydratedKeyRef = React.useRef<number | null>(null);
  const skipNextSaveRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once per version from the loaded record.
  React.useEffect(() => {
    if (versionId === null || data === undefined) return;
    if (hydratedKeyRef.current === versionId) return;
    skipNextSaveRef.current = true;
    setChecked(new Set(data.checkedKeys));
    setEscalation(data.escalationNotes);
    setContingency(data.contingencyNotes);
    hydratedKeyRef.current = versionId;
  }, [versionId, data]);

  // Debounced save on change (skips the hydration write).
  React.useEffect(() => {
    if (versionId === null || hydratedKeyRef.current !== versionId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const payload = {
      checkedKeys: [...checked],
      escalationNotes: escalation,
      contingencyNotes: contingency,
    };
    saveTimerRef.current = setTimeout(() => {
      saveDevDocChecklist({ data: { versionId, ...payload } })
        .then(() =>
          queryClient.setQueryData(["devDocChecklist", versionId], payload),
        )
        .catch((err) =>
          logger.error("validation section save failed", { versionId, err }),
        );
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [versionId, checked, escalation, contingency, queryClient]);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (versionId === null) {
    return (
      <p className="text-sm text-slate-400">
        Select a project and version to track development documentation.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 mb-3">
          Documentation for Development
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-1">
          {DEVELOPMENT_DOC_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2.5 py-1.5 text-sm text-slate-700 cursor-pointer"
            >
              <Checkbox
                checked={checked.has(item.key)}
                onCheckedChange={() => toggle(item.key)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-t border-gray-200 pt-5">
        <legend className="text-sm font-semibold text-slate-700 mb-1">
          Estimate Readiness
        </legend>
        <p className="text-sm text-slate-500 mb-2">
          Check each item confirmed as “Yes”.
        </p>
        <div className="space-y-0.5">
          {ESTIMATE_READINESS_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2.5 py-1.5 text-sm text-slate-700 cursor-pointer"
            >
              <Checkbox
                checked={checked.has(item.key)}
                onCheckedChange={() => toggle(item.key)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-700">Escalation</h3>
        <p className="text-sm text-slate-500 mt-0.5 mb-2">
          How is escalation factor and applied: Across project as shown in Basis
        </p>
        <Textarea
          value={escalation}
          onChange={(e) => setEscalation(e.target.value)}
          rows={3}
          placeholder="Describe how the escalation factor was derived and applied…"
        />
      </div>

      <div className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-700">Contingency</h3>
        <p className="text-sm text-slate-500 mt-0.5 mb-2">
          How was contingency calculated? Rule of thumb is 6% used for $1MM
          Project
        </p>
        <Textarea
          value={contingency}
          onChange={(e) => setContingency(e.target.value)}
          rows={3}
          placeholder="Describe how contingency was calculated…"
        />
      </div>
    </div>
  );
}

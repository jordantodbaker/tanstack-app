import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { DISCIPLINE_LABELS } from "~/config/disciplines";
import { formatMoney, formatCompact } from "~/lib/formatting";
import { useSelectedProject } from "~/lib/selected-project";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { readProjectIdForLoader } from "~/utils/projectCookie";

export const Route = createFileRoute("/validation")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await context.queryClient.ensureQueryData(
        projectFefRowTotalsQueryOptions(projectId),
      );
    }
  },
  component: ValidationPage,
});

// ── SVG donut chart ─────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

type Slice = { label: string; value: number; color: string };

function DonutChart({
  slices,
  total,
}: {
  slices: Slice[];
  total: number;
}) {
  const cx = 130;
  const cy = 130;
  const R = 105;
  const innerR = 62;
  const size = 260;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e2e8f0" strokeWidth={R - innerR} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#94a3b8" fontSize="11">
          No data yet
        </text>
      </svg>
    );
  }

  let cursor = 0;
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / total) * 360;
      const start = cursor;
      const end = cursor + sweep;
      cursor = end;

      if (sweep >= 359.99) {
        return (
          <g key={s.label}>
            <circle cx={cx} cy={cy} r={R} fill={s.color} />
            <circle cx={cx} cy={cy} r={innerR} fill="white" />
          </g>
        );
      }

      const s1 = polarToCartesian(cx, cy, R, start);
      const e1 = polarToCartesian(cx, cy, R, end);
      const s2 = polarToCartesian(cx, cy, innerR, end);
      const e2 = polarToCartesian(cx, cy, innerR, start);
      const large = sweep > 180 ? 1 : 0;

      return (
        <path
          key={s.label}
          d={[
            `M ${s1.x} ${s1.y}`,
            `A ${R} ${R} 0 ${large} 1 ${e1.x} ${e1.y}`,
            `L ${s2.x} ${s2.y}`,
            `A ${innerR} ${innerR} 0 ${large} 0 ${e2.x} ${e2.y}`,
            "Z",
          ].join(" ")}
          fill={s.color}
        />
      );
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <circle cx={cx} cy={cy} r={innerR} fill="white" />
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#6b7280" fontSize="11">
        Grand Total
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#111827" fontSize="15" fontWeight="700">
        {formatCompact(total)}
      </text>
    </svg>
  );
}

// ── color palette ────────────────────────────────────────────────────────────

const DISC_COLOR = "#a63434";
const INDI_COLOR = "#1e40af";
const MATERIAL_COLOR = "#6b7280";

// Per-discipline colors, indexed by the same position as DISCIPLINE_LABELS.
const DISCIPLINE_COLORS = [
  "#64748b", // 0 – procurement   (slate)
  "#92400e", // 1 – civil         (amber)
  "#78716c", // 2 – concrete      (stone)
  "#0f766e", // 3 – steel         (teal)
  "#059669", // 4 – buildings     (emerald)
  "#0891b2", // 5 – equipment     (cyan)
  "#a63434", // 6 – piping        (app red)
  "#ca8a04", // 7 – electric      (yellow)
  "#0284c7", // 8 – instruments   (sky)
  "#be185d", // 9 – coatings      (pink)
];

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
  const { data: dbTotals } = useQuery(
    projectFefRowTotalsQueryOptions(projectId),
  );

  const disciplineData = DISCIPLINE_LABELS.map((label, i) => {
    const digit = String(i);
    const labor = dbTotals?.laborByDigit[digit] ?? 0;
    const material = dbTotals?.materialsByDigit[digit] ?? 0;
    return { label, labor, material, total: labor + material };
  });

  const disciplinesTotal = disciplineData.reduce((acc, d) => acc + d.total, 0);
  const craftSupportTotal = dbTotals?.craftSupportLabor ?? 0;
  const indirectsTotal = craftSupportTotal;
  const grandTotal = disciplinesTotal + indirectsTotal;

  const maxBar = Math.max(...disciplineData.map((d) => d.total), indirectsTotal, 1);

  const donutSlices: Slice[] = [
    { label: "Disciplines", value: disciplinesTotal, color: DISC_COLOR },
    { label: "Indirects", value: indirectsTotal, color: INDI_COLOR },
  ];

  const disciplineDonutSlices: Slice[] = disciplineData
    .map((d, i) => ({
      label: d.label,
      value: d.total,
      color: DISCIPLINE_COLORS[i] ?? "#94a3b8",
    }))
    .filter((s) => s.value > 0);

  return (
    <main className="p-4 max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold">Validation</h1>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Disciplines Total Cost" value={disciplinesTotal} color={DISC_COLOR} />
        <StatCard label="Indirects Total Cost" value={indirectsTotal} color={INDI_COLOR} />
        <StatCard label="Grand Total" value={grandTotal} color="#111827" />
      </div>

      {/* ── Donut + legend ── */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Disciplines vs. Indirects
        </h2>
        <div className="flex flex-col sm:flex-row items-center gap-10">
          <DonutChart slices={donutSlices} total={grandTotal} />
          <div className="space-y-5 min-w-48">
            {donutSlices.map(({ label, value, color }) => {
              const pct =
                grandTotal > 0
                  ? ((value / grandTotal) * 100).toFixed(1)
                  : "0.0";
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
                    <p className="text-xs text-slate-400">{pct}% of total</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Discipline distribution donut ── */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          Discipline Distribution
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Share of total discipline cost by discipline
        </p>
        {disciplineDonutSlices.length === 0 ? (
          <p className="text-sm text-slate-400">
            No discipline cost data recorded yet.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-10">
            <DonutChart
              slices={disciplineDonutSlices}
              total={disciplinesTotal}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 flex-1">
              {disciplineDonutSlices.map(({ label, value, color }) => {
                const pct =
                  disciplinesTotal > 0
                    ? ((value / disciplinesTotal) * 100).toFixed(1)
                    : "0.0";
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
                      <p className="text-xs text-slate-400">{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Discipline breakdown ── */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          Discipline Breakdown
        </h2>
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
      </div>
    </main>
  );
}

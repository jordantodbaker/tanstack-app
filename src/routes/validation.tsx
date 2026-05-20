import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { SUMMARY_DISCIPLINES } from "~/config/disciplines";
import { formatMoney, formatCompact } from "~/lib/formatting";
import { useSelectedProject } from "~/lib/selected-project";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { readProjectIdForLoader } from "~/utils/projectCookie";

export const Route = createFileRoute("/validation")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await Promise.all([
        context.queryClient.ensureQueryData(
          projectFefRowTotalsQueryOptions(projectId),
        ),
        context.queryClient.ensureQueryData(
          areasByProjectQueryOptions(projectId),
        ),
      ]);
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

// Per-discipline colors keyed by SUMMARY_DISCIPLINES digit bucket.
const DISCIPLINE_COLORS_BY_DIGIT: Record<string, string> = {
  "0": "#64748b", // demolition   (slate)
  "1": "#92400e", // civil        (amber)
  "2": "#78716c", // concrete     (stone)
  "3": "#0f766e", // steel        (teal)
  "4": "#059669", // buildings    (emerald)
  "5": "#0891b2", // equipment    (cyan)
  "6": "#a63434", // piping       (app red)
  "7": "#ca8a04", // electric     (yellow)
  "8": "#0284c7", // instruments  (sky)
  "9": "#be185d", // coatings     (pink)
};

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

  const donutSlices: Slice[] = [
    { label: "Disciplines", value: disciplinesTotal, color: DISC_COLOR },
    { label: "Indirects", value: indirectsTotal, color: INDI_COLOR },
  ];

  const disciplineDonutSlices: Slice[] = disciplineData
    .map((d) => ({
      label: d.label,
      value: d.total,
      color:
        (d.digit !== null && DISCIPLINE_COLORS_BY_DIGIT[d.digit]) || "#94a3b8",
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

      <DisciplineAreaRelationships
        byArea={dbTotals?.byArea ?? []}
        areas={areas}
      />
    </main>
  );
}

/**
 * Cross-tab of discipline (column) × area (row) cost. Direct cost is the sum
 * of TAKE_OFF labor + MATERIALS for that area+digit bucket; "Indirect" is the
 * SUPPORT_LABOR pool for the area (not split by discipline — support labor
 * doesn't have a meaningful per-discipline bucket here).
 */
function DisciplineAreaRelationships({
  byArea,
  areas,
}: {
  byArea: { areaId: string; directByDigit: Record<string, number>; indirect: number }[];
  areas: { id: number; displayId: string; name: string }[];
}) {
  // Drop rows that have neither a direct nor an indirect contribution so the
  // table stays focused on areas with actual cost.
  const rows = byArea.filter(
    (a) =>
      a.indirect > 0 ||
      Object.values(a.directByDigit).some((v) => v > 0),
  );

  const areaLabel = (areaId: string) => {
    if (!areaId) return "Unassigned";
    const id = Number(areaId);
    const match = areas.find((a) => a.id === id);
    return match ? `${match.displayId} — ${match.name}` : `Area ${areaId}`;
  };

  // Only show discipline columns where any area has cost — keeps the table
  // narrow on projects that don't span every digit bucket.
  const activeDigits = SUMMARY_DISCIPLINES.filter(
    (d) =>
      d.digit !== null &&
      rows.some((a) => (a.directByDigit[d.digit as string] ?? 0) > 0),
  );

  // Column totals (across rows).
  const columnDirectTotals: Record<string, number> = {};
  for (const a of rows) {
    for (const [digit, value] of Object.entries(a.directByDigit)) {
      columnDirectTotals[digit] = (columnDirectTotals[digit] ?? 0) + value;
    }
  }
  const columnIndirectTotal = rows.reduce((acc, a) => acc + a.indirect, 0);
  const columnDirectGrand = Object.values(columnDirectTotals).reduce(
    (a, b) => a + b,
    0,
  );

  // Row totals (per area).
  const rowTotal = (a: (typeof rows)[number]) =>
    Object.values(a.directByDigit).reduce((s, v) => s + v, 0) + a.indirect;

  // For heatmap shading — find the largest single cell to scale against.
  const maxCell = Math.max(
    1,
    ...rows.flatMap((a) =>
      [...Object.values(a.directByDigit), a.indirect].filter(
        (v) => v > 0,
      ) as number[],
    ),
  );

  // Sort rows by total descending so hotspots float to the top.
  const sortedRows = [...rows].sort((a, b) => rowTotal(b) - rowTotal(a));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">
        Discipline × Area Relationships
      </h2>
      <p className="text-sm text-slate-500 mb-5">
        Where cost is incurred — direct discipline cost and indirect support
        labor by area. Empty cells mean no cost recorded.
      </p>

      {sortedRows.length === 0 ? (
        <p className="text-sm text-slate-400">
          No area-tagged cost yet. Assign FEF rows to an area to see the
          breakdown here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 border-b border-slate-200 sticky left-0 bg-slate-50">
                  Area
                </th>
                {activeDigits.map((d) => (
                  <th
                    key={d.digit ?? d.label}
                    className="px-3 py-2 border-b border-slate-200 text-right whitespace-nowrap"
                  >
                    {d.label}
                  </th>
                ))}
                <th
                  className="px-3 py-2 border-b border-slate-200 text-right whitespace-nowrap"
                  style={{ color: INDI_COLOR }}
                >
                  Indirect
                </th>
                <th className="px-3 py-2 border-b border-slate-200 text-right whitespace-nowrap text-slate-700">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((a) => (
                <tr key={a.areaId || "__unassigned"}>
                  <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 sticky left-0 bg-white">
                    {areaLabel(a.areaId)}
                  </td>
                  {activeDigits.map((d) => (
                    <RelationshipCell
                      key={d.digit ?? d.label}
                      value={a.directByDigit[d.digit as string] ?? 0}
                      max={maxCell}
                      tone="direct"
                    />
                  ))}
                  <RelationshipCell
                    value={a.indirect}
                    max={maxCell}
                    tone="indirect"
                  />
                  <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums font-semibold text-slate-800">
                    ${formatMoney(rowTotal(a))}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-slate-50 text-slate-700">
                  Total
                </td>
                {activeDigits.map((d) => (
                  <td
                    key={d.digit ?? d.label}
                    className="px-3 py-2 text-right tabular-nums text-slate-700"
                  >
                    {columnDirectTotals[d.digit as string]
                      ? `$${formatMoney(columnDirectTotals[d.digit as string])}`
                      : "—"}
                  </td>
                ))}
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  style={{ color: INDI_COLOR }}
                >
                  {columnIndirectTotal > 0
                    ? `$${formatMoney(columnIndirectTotal)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                  ${formatMoney(columnDirectGrand + columnIndirectTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RelationshipCell({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "direct" | "indirect";
}) {
  if (value <= 0) {
    return (
      <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-300">
        —
      </td>
    );
  }
  // Heatmap shading: relative intensity 0..1 of this cell vs the biggest in
  // the table, capped so even small cells get a faint tint.
  const intensity = Math.max(0.08, Math.min(1, value / max));
  const bg =
    tone === "indirect"
      ? `rgba(30, 64, 175, ${intensity * 0.18})` // INDI_COLOR
      : `rgba(166, 52, 52, ${intensity * 0.18})`; // DISC_COLOR
  const fg = tone === "indirect" ? INDI_COLOR : "#374151";
  return (
    <td
      className="px-3 py-2 border-b border-slate-100 text-right tabular-nums"
      style={{ background: bg, color: fg }}
    >
      ${formatMoney(value)}
    </td>
  );
}

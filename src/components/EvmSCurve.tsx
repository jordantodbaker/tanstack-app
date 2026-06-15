import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelectedProject } from "~/lib/selected-project";
import {
  evmTimeSeriesQueryOptions,
  type EvmTimeSeriesPoint,
} from "~/utils/reporting";
import { formatCompact } from "~/lib/formatting";
import { QueryError } from "~/components/ui/list-page";

/**
 * EVM S-curve: plots project-total PV, EV, and AC across reporting-period
 * data dates. Pure SVG, no chart library — matches the existing DonutChart
 * pattern in validation.tsx. Empty state for projects with <2 periods, since
 * "trend" needs at least two points.
 */
export function EvmSCurve() {
  const { projectId } = useSelectedProject();
  const {
    data: points = [],
    isError,
    error,
  } = useQuery(evmTimeSeriesQueryOptions(projectId));

  if (projectId === null) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-800">EVM S-curve</h2>
        <p className="text-xs text-slate-500">
          Project-total Planned Value, Earned Value, and Actual Cost across
          reporting periods.
        </p>
      </div>
      {isError ? (
        // Without this branch the empty-state message would show on errors
        // too, masking real bugs as "no periods yet."
        <QueryError error={error} label="S-curve data" />
      ) : points.length < 2 ? (
        <p className="text-sm text-slate-500 py-6 text-center">
          {points.length === 0
            ? "No reporting periods yet."
            : "Need at least two periods to plot a trend. Create another period in the future to see the S-curve."}
        </p>
      ) : (
        <SCurveChart points={points} />
      )}
    </section>
  );
}

// ── chart geometry ───────────────────────────────────────────────────────

const WIDTH = 760;
const HEIGHT = 300;
const PAD_TOP = 16;
const PAD_RIGHT = 140; // room for legend
const PAD_BOTTOM = 56; // room for rotated date labels
const PAD_LEFT = 72;

const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

// Standard EVM color convention. PV blue, EV green, AC red.
const COLORS = {
  pv: "#2563eb",
  ev: "#059669",
  ac: "#dc2626",
} as const;

type Series = "pv" | "ev" | "ac";

const SERIES_LABELS: Record<Series, string> = {
  pv: "PV — Planned Value",
  ev: "EV — Earned Value",
  ac: "AC — Actual Cost",
};

function SCurveChart({ points }: { points: EvmTimeSeriesPoint[] }) {
  // X scale: time-proportional between first and last dataDate. If all dates
  // collapse (shouldn't happen given the unique constraint, but be safe),
  // fall back to evenly spaced.
  const times = points.map((p) => new Date(p.dataDate).getTime());
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const tSpan = tMax - tMin;
  const xPos = (i: number, t: number) =>
    PAD_LEFT +
    (tSpan > 0 ? ((t - tMin) / tSpan) * PLOT_W : (i / (points.length - 1)) * PLOT_W);

  // Y scale: 0 to a "nice" max above the largest observed value across all
  // three series. Hides bumpy axis scaling as new periods come in.
  const observedMax = Math.max(
    1,
    ...points.flatMap((p) => [p.total.pv, p.total.ev, p.total.ac]),
  );
  const yMax = niceMax(observedMax);
  const yPos = (v: number) =>
    PAD_TOP + PLOT_H - (v / yMax) * PLOT_H;

  // Five Y ticks evenly spaced from 0 to yMax.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  function pathFor(getValue: (p: EvmTimeSeriesPoint) => number): string {
    return points
      .map((p, i) => {
        const x = xPos(i, new Date(p.dataDate).getTime());
        const y = yPos(getValue(p));
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  const series: Array<{ key: Series; path: string; values: number[] }> = [
    {
      key: "pv",
      path: pathFor((p) => p.total.pv),
      values: points.map((p) => p.total.pv),
    },
    {
      key: "ev",
      path: pathFor((p) => p.total.ev),
      values: points.map((p) => p.total.ev),
    },
    {
      key: "ac",
      path: pathFor((p) => p.total.ac),
      values: points.map((p) => p.total.ac),
    },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        role="img"
        aria-label="Earned Value Management S-curve"
      >
        {/* Y-axis gridlines + labels */}
        {yTicks.map((v, i) => {
          const y = yPos(v);
          return (
            <g key={`y-${i}`}>
              <line
                x1={PAD_LEFT}
                x2={PAD_LEFT + PLOT_W}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={i === 0 ? "" : "2 3"}
              />
              <text
                x={PAD_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#64748b"
              >
                {formatCompact(v)}
              </text>
            </g>
          );
        })}

        {/* X-axis: tick + rotated date label per point */}
        {points.map((p, i) => {
          const x = xPos(i, new Date(p.dataDate).getTime());
          const y = PAD_TOP + PLOT_H;
          const label = shortDate(p.dataDate);
          return (
            <g key={`x-${p.periodId}`}>
              <line
                x1={x}
                x2={x}
                y1={y}
                y2={y + 4}
                stroke="#94a3b8"
              />
              <text
                x={x}
                y={y + 18}
                textAnchor="end"
                fontSize="10"
                fill="#475569"
                transform={`rotate(-35 ${x} ${y + 18})`}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Series paths + point markers */}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={s.path}
              fill="none"
              stroke={COLORS[s.key]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((p, i) => {
              const x = xPos(i, new Date(p.dataDate).getTime());
              const y = yPos(s.values[i]);
              return (
                <circle
                  key={`${s.key}-${p.periodId}`}
                  cx={x}
                  cy={y}
                  r={3}
                  fill="white"
                  stroke={COLORS[s.key]}
                  strokeWidth={1.5}
                >
                  <title>
                    {`${SERIES_LABELS[s.key]}\n${p.label} (${shortDate(p.dataDate)}): ${formatCompact(s.values[i])}`}
                  </title>
                </circle>
              );
            })}
          </g>
        ))}

        {/* Legend (top-right). Items spaced wide enough that the previous
            item's sub-label descenders clear the next item's label cap
            height — at 22px spacing they collided visually. */}
        <g transform={`translate(${WIDTH - PAD_RIGHT + 12}, ${PAD_TOP + 8})`}>
          {(["pv", "ev", "ac"] as const).map((k, i) => {
            const latest =
              k === "pv"
                ? points[points.length - 1].total.pv
                : k === "ev"
                  ? points[points.length - 1].total.ev
                  : points[points.length - 1].total.ac;
            return (
              <g key={k} transform={`translate(0, ${i * 36})`}>
                <rect
                  x={0}
                  y={4}
                  width={14}
                  height={4}
                  rx={1}
                  fill={COLORS[k]}
                />
                <text
                  x={20}
                  y={10}
                  fontSize="11"
                  fontWeight="500"
                  fill="#0f172a"
                >
                  {SERIES_LABELS[k]}
                </text>
                <text x={20} y={24} fontSize="10" fill="#64748b">
                  latest: {formatCompact(latest)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── pure helpers ─────────────────────────────────────────────────────────

/** Rounds `n` up to a "nice" axis-friendly value (1/2/5 × power of 10). */
function niceMax(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 100;
  const order = Math.pow(10, Math.floor(Math.log10(n)));
  const normalized = n / order;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * order;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

import { formatCompact } from "~/lib/formatting";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export type DonutSlice = { label: string; value: number; color: string };

/**
 * A ring chart of `slices`, sized to their share of `total`, with the total
 * in the hole. Pure SVG — no chart library. An all-zero total draws an empty
 * ring that says so.
 */
export function DonutChart({
  slices,
  total,
}: {
  slices: DonutSlice[];
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

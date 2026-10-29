import { SUMMARY_DISCIPLINES } from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";
import { INDI_COLOR } from "./validation-colors";

/**
 * Cross-tab of discipline (column) × area (row) cost. Direct cost is the sum
 * of TAKE_OFF labor + MATERIALS for that area+digit bucket; "Indirect" is the
 * SUPPORT_LABOR pool for the area (not split by discipline — support labor
 * doesn't have a meaningful per-discipline bucket here).
 */
export function DisciplineAreaRelationships({
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
    <>
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
    </>
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

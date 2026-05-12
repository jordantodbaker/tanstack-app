import type { FefRow } from "./types";

/**
 * Aggregates Take Off rows into one row per CBS id (row.id):
 *   - drops rows with quantity <= 0 or non-numeric quantity
 *   - sums quantity and labor hours within each id
 *   - returns a weighted-average labor rate (totalCost / totalHours)
 *   - emits an empty labor rate string when total hours are zero
 *
 * The returned rows reuse the FIRST encountered row for each id as the base,
 * so all non-aggregated fields (cbs name, uom, etc.) come from that row.
 */
export function aggregateTakeOff(rows: FefRow[]): FefRow[] {
  const qualifiedRows = rows.filter((r) => Number(r.quantity) > 0);

  type Agg = { baseRow: FefRow; qty: number; hours: number; cost: number };
  const groups = new Map<string, Agg>();

  for (const row of qualifiedRows) {
    const qty = parseFloat(row.quantity) || 0;
    const hours = parseFloat(row.laborHours) || 0;
    const rate = parseFloat(row.laborRate) || 0;
    const existing = groups.get(row.id);
    if (!existing) {
      groups.set(row.id, { baseRow: row, qty, hours, cost: hours * rate });
    } else {
      existing.qty += qty;
      existing.hours += hours;
      existing.cost += hours * rate;
    }
  }

  return Array.from(groups.values()).map(
    ({ baseRow, qty, hours, cost }) => ({
      ...baseRow,
      quantity: String(qty),
      laborHours: String(hours),
      laborRate: hours > 0 ? String(cost / hours) : "",
    }),
  );
}

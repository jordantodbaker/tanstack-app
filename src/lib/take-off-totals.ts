/**
 * Live running totals for a Take Off sheet — item count, labor hours, and labor
 * cost. Pure (no React) so it's unit-tested and cheap to recompute on edits.
 *
 * Cost matches the grid's own definition (labor hours × labor rate); a row
 * without a computable rate contributes its hours but $0. Blank template rows
 * (the auto-appended trailing blank, empty seeded rows) are ignored so the item
 * count reflects real entries.
 */
import type { FefRow } from "./types";
import { fefRowHasUserData } from "./fef-helpers";

export type TakeOffTotals = {
  itemCount: number;
  laborHours: number;
  laborCost: number;
};

export function computeTakeOffTotals(rows: FefRow[]): TakeOffTotals {
  let itemCount = 0;
  let laborHours = 0;
  let laborCost = 0;

  for (const r of rows) {
    const isBlankTemplate =
      r.id.startsWith("__fe-blank-") && !fefRowHasUserData(r);
    if (isBlankTemplate) continue;
    itemCount++;

    const hours = parseFloat(r.laborHours);
    const rate = parseFloat(r.laborRate);
    if (Number.isFinite(hours)) laborHours += hours;
    if (Number.isFinite(hours) && Number.isFinite(rate) && r.laborRate !== "") {
      laborCost += hours * rate;
    }
  }

  return { itemCount, laborHours, laborCost };
}

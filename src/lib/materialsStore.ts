import type { FefRow } from "./types";
import { createTotalsStore } from "./totalsStore";

const store = createTotalsStore();

export const setMaterialsSectionTotal = store.setTotal;

const rowsBySection: Map<string, FefRow[]> = new Map();

export function getMaterialsSectionRows(l1: string): FefRow[] | undefined {
  return rowsBySection.get(l1);
}

export function setMaterialsSectionRows(l1: string, rows: FefRow[]): void {
  rowsBySection.set(l1, rows);
}

export function useMaterialsTotalsByFirstDigit(): Map<string, number> {
  const map = store.useTotals();
  const byDigit = new Map<string, number>();
  for (const [l1, total] of map) {
    const d = l1[0] ?? "";
    byDigit.set(d, (byDigit.get(d) ?? 0) + total);
  }
  return byDigit;
}

import { useSyncExternalStore } from "react";
import type { FefRow } from "./types";

let totals: Map<string, number> = new Map();
const listeners = new Set<() => void>();

const rowsBySection: Map<string, FefRow[]> = new Map();

export function getMaterialsSectionRows(l1: string): FefRow[] | undefined {
  return rowsBySection.get(l1);
}

export function setMaterialsSectionRows(l1: string, rows: FefRow[]): void {
  rowsBySection.set(l1, rows);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return totals;
}

export function setMaterialsSectionTotal(l1: string, total: number) {
  if (totals.get(l1) === total) return;
  totals = new Map(totals);
  totals.set(l1, total);
  for (const l of listeners) l();
}

export function useMaterialsTotalsByFirstDigit(): Map<string, number> {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const byDigit = new Map<string, number>();
  for (const [l1, total] of map) {
    const d = l1[0] ?? "";
    byDigit.set(d, (byDigit.get(d) ?? 0) + total);
  }
  return byDigit;
}

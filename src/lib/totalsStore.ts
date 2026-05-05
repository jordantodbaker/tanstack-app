import { useSyncExternalStore } from "react";

export function createTotalsStore() {
  let totals: Map<string, number> = new Map();
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return totals;
  }

  function setTotal(key: string, total: number) {
    if (totals.get(key) === total) return;
    totals = new Map(totals);
    totals.set(key, total);
    for (const l of listeners) l();
  }

  function useTotals(): Map<string, number> {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  return { setTotal, useTotals };
}

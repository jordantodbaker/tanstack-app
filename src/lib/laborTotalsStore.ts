import { createTotalsStore } from "./totalsStore";

const store = createTotalsStore();

export const setLaborTotal = store.setTotal;
export const useLaborTotals = store.useTotals;

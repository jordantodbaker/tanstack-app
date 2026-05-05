import { useSyncExternalStore } from "react";
//#region src/lib/totalsStore.ts
function createTotalsStore() {
	let totals = /* @__PURE__ */ new Map();
	const listeners = /* @__PURE__ */ new Set();
	function subscribe(listener) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}
	function getSnapshot() {
		return totals;
	}
	function setTotal(key, total) {
		if (totals.get(key) === total) return;
		totals = new Map(totals);
		totals.set(key, total);
		for (const l of listeners) l();
	}
	function useTotals() {
		return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	}
	return {
		setTotal,
		useTotals
	};
}
//#endregion
//#region src/lib/materialsStore.ts
var store$1 = createTotalsStore();
var setMaterialsSectionTotal = store$1.setTotal;
var rowsBySection = /* @__PURE__ */ new Map();
function getMaterialsSectionRows(l1) {
	return rowsBySection.get(l1);
}
function setMaterialsSectionRows(l1, rows) {
	rowsBySection.set(l1, rows);
}
function useMaterialsTotalsByFirstDigit() {
	const map = store$1.useTotals();
	const byDigit = /* @__PURE__ */ new Map();
	for (const [l1, total] of map) {
		const d = l1[0] ?? "";
		byDigit.set(d, (byDigit.get(d) ?? 0) + total);
	}
	return byDigit;
}
//#endregion
//#region src/lib/laborTotalsStore.ts
var store = createTotalsStore();
var setLaborTotal = store.setTotal;
var useLaborTotals = store.useTotals;
//#endregion
export { setMaterialsSectionTotal as a, setMaterialsSectionRows as i, useLaborTotals as n, useMaterialsTotalsByFirstDigit as o, getMaterialsSectionRows as r, setLaborTotal as t };

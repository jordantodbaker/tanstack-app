import type { CbsOption, FefRow } from "./types";

type CbsItemFields = {
  displayCode: string;
  costCode?: string;
  name: string | null;
  uom: string;
  displayDescription?: string | null;
};

export function toCbsOption(item: CbsItemFields): CbsOption {
  return {
    displayCode: item.displayCode,
    costCode: item.costCode,
    name: item.name ?? "",
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  };
}

export function sumLaborCost(rows: FefRow[]): number {
  return rows.reduce((acc, row) => {
    const h = parseFloat(row.laborHours);
    const r = parseFloat(row.laborRate);
    return acc + (isNaN(h) || isNaN(r) ? 0 : h * r);
  }, 0);
}

export function sumMaterialCost(rows: FefRow[]): number {
  return rows.reduce((acc, row) => {
    const q = parseFloat(row.quantity);
    const c = parseFloat(row.materialCost);
    return acc + (isNaN(q) || isNaN(c) ? 0 : q * c);
  }, 0);
}

export const tabTriggerClass =
  "rounded-md border border-slate-300 bg-white px-3 md:px-6 py-2.5 md:py-4 text-sm md:text-lg font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 data-active:border-[#a63434] data-active:bg-[#a63434] data-active:text-white data-active:shadow";

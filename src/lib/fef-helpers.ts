import type { CbsOption, FefRow } from "./types";

/**
 * The 18 free-text fields of a FefRow — every key except `id`. All default to
 * `""`. Keep this as the single source of truth: row factories, blank-row
 * detection, and DB serialization all iterate it, so adding a field to FefRow
 * only requires updating the type and this list.
 */
export const FEF_ROW_STRING_FIELDS = [
  "name",
  "description",
  "shopField",
  "weldGroupDescription",
  "quantity",
  "size",
  "unit",
  "metallurgyCode",
  "boreSize",
  "role",
  "schedule",
  "taskCode",
  "laborHours",
  "laborRate",
  "materialCost",
  "equipment",
  "notes",
  "sub",
  "area",
] as const satisfies readonly (keyof FefRow)[];

/** Builds a FefRow with every field blank, then applies `partial` overrides. */
export function makeFefRow(partial: Partial<FefRow> = {}): FefRow {
  const base = Object.fromEntries(
    FEF_ROW_STRING_FIELDS.map((f) => [f, ""]),
  ) as Omit<FefRow, "id">;
  return { id: "", ...base, ...partial };
}

/** True when any free-text field of the row holds user-entered data. */
export function fefRowHasUserData(row: FefRow): boolean {
  return FEF_ROW_STRING_FIELDS.some((f) => row[f] !== "");
}

type CbsItemFields = {
  displayCode: string;
  costCode?: string;
  name: string | null;
  uom: string;
  displayDescription?: string | null;
  subReporting?: boolean | null;
};

export function toCbsOption(item: CbsItemFields): CbsOption {
  return {
    displayCode: item.displayCode,
    costCode: item.costCode,
    name: item.name ?? "",
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
    subReporting: item.subReporting ?? null,
  };
}

export function canComputeTotalCost(row: FefRow): boolean {
  const hours = parseFloat(row.laborHours);
  const rate = parseFloat(row.laborRate);
  return (
    !isNaN(hours) && hours > 0 && !isNaN(rate) && row.laborRate !== ""
  );
}

export const tabTriggerClass =
  "cursor-pointer select-none rounded-md border border-slate-300 bg-white px-3 md:px-6 py-2.5 md:py-4 text-sm md:text-lg font-medium text-slate-700 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a63434]/40 data-active:border-[#a63434] data-active:bg-[#a63434] data-active:text-white data-active:shadow data-active:hover:bg-[#8d2a2a] data-active:hover:border-[#8d2a2a] data-active:hover:text-white";

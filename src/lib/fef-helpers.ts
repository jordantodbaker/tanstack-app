import type { CbsOption, FefRow } from "./types";

/**
 * Shared stable empty array for `useQuery` fallbacks (`data = EMPTY_ARRAY`) in
 * the take-off render path. Using one reference instead of a fresh `[]`/`?? []`
 * each render keeps derived option lists (`areaOptions`, `cbsOptions`, …) — and
 * therefore `metaRev` — reference-stable while queries stream in on a cold
 * cache. A fresh `[]` there churns every dependent memo on every render, which
 * compounded into "Maximum update depth exceeded" on the piping/steel take-offs.
 * Typed `never[]` so it's assignable to any element type via `?? EMPTY_ARRAY`.
 */
export const EMPTY_ARRAY: never[] = [];

/**
 * The free-text fields of a FefRow — every key except `id`. All default to
 * `""`. Keep this as the single source of truth: row factories, blank-row
 * detection, and DB serialization all iterate it, so adding a field to FefRow
 * only requires updating the type and this list.
 */
export const FEF_ROW_STRING_FIELDS = [
  "name",
  "description",
  "shopField",
  "fabricateErect",
  "weldGroupDescription",
  "quantity",
  "size",
  "unit",
  "metallurgyCode",
  "boreSize",
  "role",
  "crewMixId",
  "schedule",
  "taskCode",
  "laborHours",
  "laborFactor",
  "laborRate",
  "materialCost",
  "equipment",
  "notes",
  "sub",
  "area",
  // Reference / line-list attributes
  "projectPhase",
  "drawingNumber",
  "drawingRev",
  "processUnit",
  "areaName",
  "systemName",
  "tagNumber",
  // Spec & testing (piping/mechanical)
  "lineSpec",
  "paintSpec",
  "insulation",
  "nde",
  "pwht",
  "hydro",
  "heatTrace",
  // Location
  "agUg",
  "elevation",
  // Dimensions (Structural Steel take-off)
  "height",
  "width",
  "length",
  "shapeCount",
  // Labor adjustments
  "siteFactor",
  "feetAboveGrade",
  "efficAdjust",
  "laborFactorAdj",
  "elevAdder",
  "weldAdder",
] as const satisfies readonly (keyof FefRow)[];

/**
 * The FefRow **DB** data columns, in a stable order: `cbsCode` (persisted from
 * the client row `id`) followed by every free-text field. This is what the
 * write SQL (`saveFefRows`/`appendTakeOffRows`) and the version copy
 * (`createVersion`) build their column lists from, so a new field flows through
 * to every write path by editing only the type + FEF_ROW_STRING_FIELDS.
 */
export const FEF_DATA_COLUMNS = ["cbsCode", ...FEF_ROW_STRING_FIELDS] as const;

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

/**
 * Total Cost = laborHours × laborRate, so it's computable only when both parse
 * as numbers and the hours are positive. The one definition of that rule —
 * the invalid-row badge (client and server) and the Total Cost cell all route
 * through it, so they can't disagree about which rows are incomplete.
 */
export function isTotalCostComputable(
  laborHours: string,
  laborRate: string,
): boolean {
  const hours = parseFloat(laborHours);
  const rate = parseFloat(laborRate);
  return !isNaN(hours) && hours > 0 && !isNaN(rate) && laborRate !== "";
}

export function canComputeTotalCost(row: FefRow): boolean {
  return isTotalCostComputable(row.laborHours, row.laborRate);
}

/**
 * Input shape for `isTakeOffRowInvalid`. Accepts either the client-side
 * `FefRow` (where the CBS code lives in `id`) or a server-side Prisma
 * payload (where it lives in the `cbsCode` column), plus any subset of the
 * 18 free-text fields. `laborHours` and `laborRate` are required because
 * they're the inputs to the Total Cost computation.
 */
export type TakeOffValidationInput = Partial<
  Pick<FefRow, (typeof FEF_ROW_STRING_FIELDS)[number]>
> & {
  id?: string;
  cbsCode?: string;
  laborHours: string;
  laborRate: string;
};

/**
 * A Take Off row is invalid when the user has clearly started entering data
 * but the Total Cost (laborHours × laborRate) can't be computed. "Started"
 * means *any* free-text field is non-empty (so picking just a schedule, a
 * role, a task code — anything — counts) or a real CBS code is present.
 * Untouched blank-template rows return `false`.
 *
 * The predicate iterates `FEF_ROW_STRING_FIELDS`, so adding a field to the
 * FefRow shape automatically extends the "started" check.
 */
export function isTakeOffRowInvalid(row: TakeOffValidationInput): boolean {
  const idIsRealCode =
    typeof row.id === "string" &&
    row.id !== "" &&
    !row.id.startsWith("__fe-blank-");
  const cbsTouched = !!row.cbsCode && row.cbsCode !== "";
  const anyFieldTouched = FEF_ROW_STRING_FIELDS.some((f) => {
    const v = row[f];
    return v != null && v !== "";
  });
  if (!idIsRealCode && !cbsTouched && !anyFieldTouched) return false;

  return !isTotalCostComputable(row.laborHours, row.laborRate);
}

export const tabTriggerClass =
  "cursor-pointer select-none rounded-md border border-slate-300 bg-white px-3 md:px-6 py-2.5 md:py-4 text-sm md:text-lg font-medium text-slate-700 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a63434]/40 data-active:border-[#a63434] data-active:bg-[#a63434] data-active:text-white data-active:shadow data-active:hover:bg-[#8d2a2a] data-active:hover:border-[#8d2a2a] data-active:hover:text-white";

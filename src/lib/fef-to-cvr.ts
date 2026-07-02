/**
 * Build a CVR draft from selected Field Estimate Form take-off rows — the
 * "convert these estimate rows into a change" bridge.
 *
 * Each take-off row becomes one LABOR cost-buildup line (quantity = labor
 * hours, unit rate = labor rate), mirroring the estimate's own take-off cost
 * definition (`laborHours × laborRate`, per `accumulateProjectTotals`). The
 * draft's `costImpact` is therefore the sum of the selected rows' labor cost
 * and `laborHoursImpact` their total hours — so the CVR opens pre-loaded with
 * numbers consistent with what those rows contribute to the estimate. The user
 * still reviews and edits before saving.
 *
 * Pure — no React/Prisma — so the mapping is unit-tested and shared by whatever
 * opens the CVR dialog. Composes the existing `cvrLineItems` roll-up helpers.
 */
import type { FefRow } from "./types";
import { fefRowHasUserData } from "./fef-helpers";
import {
  buildupCbsCodes,
  sumLineItems,
  type CvrLineItemDto,
} from "~/utils/cvrLineItems";

/** The subset of the CVR form a converted draft pre-fills. Assignable to the
 *  dialog's create-mode form state. */
export type FefCvrDraft = {
  title: string;
  description: string;
  discipline: string;
  area: string;
  cbsCodes: string[];
  costImpact: number;
  laborHoursImpact: number;
  lineItems: CvrLineItemDto[];
};

/** A take-off row's CBS code lives in `id` unless it's a blank-template
 *  sentinel; return the real code or "". */
function realCbsCode(row: FefRow): string {
  return row.id && !row.id.startsWith("__fe-blank-") ? row.id : "";
}

const numOr0 = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/** A row worth converting: has a real CBS code or some user-entered data. */
export function isConvertibleRow(row: FefRow): boolean {
  return realCbsCode(row) !== "" || fefRowHasUserData(row);
}

function rowLabel(row: FefRow): string {
  return (
    row.name.trim() ||
    row.description.trim() ||
    realCbsCode(row) ||
    "Take-off item"
  );
}

export function buildCvrDraftFromFefRows(
  rows: FefRow[],
  opts: { discipline: string; disciplineLabel?: string; areaLabel?: string },
): FefCvrDraft {
  const convertible = rows.filter(isConvertibleRow);

  const lineItems: CvrLineItemDto[] = convertible.map((row, i) => ({
    position: i,
    description: rowLabel(row),
    cbsCode: realCbsCode(row),
    costType: "LABOR",
    quantity: numOr0(row.laborHours),
    unit: "HR",
    unitRate: numOr0(row.laborRate),
    notes: "",
  }));

  const laborHoursImpact = lineItems.reduce((sum, li) => sum + li.quantity, 0);

  // Common area only if every converted row carries the same non-empty area.
  const nonEmptyAreas = convertible
    .map((r) => r.area)
    .filter((a) => a !== "");
  const areaSet = new Set(nonEmptyAreas);
  const area =
    areaSet.size === 1 && nonEmptyAreas.length === convertible.length
      ? [...areaSet][0]
      : "";

  const n = convertible.length;
  const disc = opts.disciplineLabel || opts.discipline || "estimate";
  const title = `Field change — ${disc} (${n} item${n === 1 ? "" : "s"})`;

  const scopeLabel = opts.areaLabel && area ? ` in ${opts.areaLabel}` : "";
  const description =
    n === 0
      ? ""
      : `Generated from ${n} field-estimate take-off row${
          n === 1 ? "" : "s"
        }${scopeLabel}:\n` +
        convertible
          .map((r) => `• ${rowLabel(r)} — ${numOr0(r.laborHours)} hr`)
          .join("\n");

  return {
    title,
    description,
    discipline: opts.discipline,
    area,
    cbsCodes: buildupCbsCodes(lineItems),
    costImpact: sumLineItems(lineItems),
    laborHoursImpact,
    lineItems,
  };
}

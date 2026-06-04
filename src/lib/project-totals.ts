/**
 * Per-area roll-up. `directByDigit` sums direct cost (TAKE_OFF labor +
 * MATERIALS) under each discipline digit-bucket; `indirect` sums SUPPORT_LABOR
 * across all disciplines. Unassigned rows (FefRow.area === "") land under
 * `areaId: ""`.
 */
export type AreaTotals = {
  areaId: string;
  directByDigit: Record<string, number>;
  indirect: number;
};

import { isTakeOffRowInvalid } from "./fef-helpers";

export type ProjectFefRowTotals = {
  laborByDigit: Record<string, number>;
  laborHoursByDigit: Record<string, number>;
  quantityByDigit: Record<string, number>;
  craftSupportLabor: number;
  craftSupportLaborHours: number;
  materialsByDigit: Record<string, number>;
  byArea: AreaTotals[];
  /**
   * Count of Take Off rows per discipline that have user-entered data but
   * can't compute a Total Cost (missing or zero labor hours/rate). Keyed by
   * the discipline id (e.g. "civil", "piping"). Disciplines with zero
   * invalid rows are omitted.
   */
  invalidByDiscipline: Record<string, number>;
};

// Discipline ID → first-digit bucket used by Summary/Validation. Keep in sync
// with SUMMARY_DIGIT_TO_DISCIPLINE_ID in src/config/disciplines.ts.
export const DISCIPLINE_TO_DIGIT: Record<string, string> = {
  "project-development": "0",
  administration: "0",
  engineering: "0",
  procurement: "0",
  indirects: "0",
  demolition: "0",
  civil: "1",
  concrete: "2",
  steel: "3",
  buildings: "4",
  equipment: "5",
  piping: "6",
  electric: "7",
  instruments: "8",
  coatings: "9",
  commissioning: "9",
  operations: "9",
  contingency: "9",
};

export type ProjectTotalsRow = {
  discipline: string;
  section: string;
  cbsCode: string | null;
  quantity: string;
  laborHours: string;
  laborRate: string;
  materialCost: string;
  /** FefRow.area — the assigned area id as a string, "" when unassigned. */
  area?: string;
  // The remaining FEF free-text fields. Any one of them being non-empty
  // signals "user touched this row" in the Take Off invalid check, so they
  // need to be available on the server-side payload.
  name?: string;
  description?: string;
  shopField?: string;
  weldGroupDescription?: string;
  size?: string;
  unit?: string;
  metallurgyCode?: string;
  boreSize?: string;
  role?: string;
  crewMixId?: string;
  schedule?: string;
  taskCode?: string;
  equipment?: string;
  notes?: string;
  sub?: string;
};

export function accumulateProjectTotals(
  rows: ProjectTotalsRow[],
): ProjectFefRowTotals {
  const laborByDigit: Record<string, number> = {};
  const laborHoursByDigit: Record<string, number> = {};
  const quantityByDigit: Record<string, number> = {};
  let craftSupportLabor = 0;
  let craftSupportLaborHours = 0;
  const materialsByDigit: Record<string, number> = {};
  const invalidByDiscipline: Record<string, number> = {};
  // Area roll-up — mutable Maps during accumulation, serialized to a stable
  // array at the end.
  const areaMap = new Map<
    string,
    { direct: Map<string, number>; indirect: number }
  >();
  const bumpAreaDirect = (areaId: string, digit: string, amount: number) => {
    let bucket = areaMap.get(areaId);
    if (!bucket) {
      bucket = { direct: new Map(), indirect: 0 };
      areaMap.set(areaId, bucket);
    }
    bucket.direct.set(digit, (bucket.direct.get(digit) ?? 0) + amount);
  };
  const bumpAreaIndirect = (areaId: string, amount: number) => {
    let bucket = areaMap.get(areaId);
    if (!bucket) {
      bucket = { direct: new Map(), indirect: 0 };
      areaMap.set(areaId, bucket);
    }
    bucket.indirect += amount;
  };

  for (const r of rows) {
    const qty = parseFloat(r.quantity);
    const hours = parseFloat(r.laborHours);
    const rate = parseFloat(r.laborRate);
    const matCost = parseFloat(r.materialCost);
    const labor =
      Number.isFinite(hours) && Number.isFinite(rate) ? hours * rate : 0;
    // Resolve the discipline-bucket digit. Prefer the CBS code's leading
    // digit; fall back to the row's discipline field. For TAKE_OFF /
    // SUPPORT_LABOR rows `discipline` is a discipline id (e.g. "piping")
    // which we map; for MATERIALS rows it's the L1 code (e.g. "601") whose
    // first character IS the digit.
    const disciplineFallback =
      DISCIPLINE_TO_DIGIT[r.discipline] ||
      (r.discipline && /^\d/.test(r.discipline) ? r.discipline[0] : "");
    const digit = (r.cbsCode && r.cbsCode[0]) || disciplineFallback || "";
    const areaId = r.area ?? "";

    if (r.section === "TAKE_OFF") {
      if (digit && labor > 0) {
        laborByDigit[digit] = (laborByDigit[digit] ?? 0) + labor;
        bumpAreaDirect(areaId, digit, labor);
      }
      if (digit && Number.isFinite(hours) && hours > 0) {
        laborHoursByDigit[digit] =
          (laborHoursByDigit[digit] ?? 0) + hours;
      }
      if (digit && Number.isFinite(qty) && qty > 0) {
        quantityByDigit[digit] = (quantityByDigit[digit] ?? 0) + qty;
      }
      // Invalid = the user started the row but the Total Cost isn't computable.
      // Hand the whole row through — the predicate iterates every free-text
      // field, so picking any one (schedule, role, task code, etc.) is
      // enough to count as "started".
      if (
        r.discipline &&
        isTakeOffRowInvalid({ ...r, cbsCode: r.cbsCode ?? "" })
      ) {
        invalidByDiscipline[r.discipline] =
          (invalidByDiscipline[r.discipline] ?? 0) + 1;
      }
    } else if (r.section === "SUPPORT_LABOR") {
      craftSupportLabor += labor;
      if (Number.isFinite(hours) && hours > 0) {
        craftSupportLaborHours += hours;
      }
      if (labor > 0) bumpAreaIndirect(areaId, labor);
    } else if (r.section === "MATERIALS") {
      if (Number.isFinite(qty) && Number.isFinite(matCost) && digit) {
        const matValue = qty * matCost;
        materialsByDigit[digit] = (materialsByDigit[digit] ?? 0) + matValue;
        if (matValue > 0) bumpAreaDirect(areaId, digit, matValue);
      }
    }
  }

  const byArea: AreaTotals[] = Array.from(areaMap.entries()).map(
    ([areaId, b]) => ({
      areaId,
      directByDigit: Object.fromEntries(b.direct),
      indirect: b.indirect,
    }),
  );

  return {
    laborByDigit,
    laborHoursByDigit,
    quantityByDigit,
    craftSupportLabor,
    craftSupportLaborHours,
    materialsByDigit,
    byArea,
    invalidByDiscipline,
  };
}

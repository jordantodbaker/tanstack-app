export type ProjectFefRowTotals = {
  laborByDigit: Record<string, number>;
  laborHoursByDigit: Record<string, number>;
  quantityByDigit: Record<string, number>;
  craftSupportLabor: number;
  craftSupportLaborHours: number;
  materialsByDigit: Record<string, number>;
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

    if (r.section === "TAKE_OFF") {
      if (digit && labor > 0) {
        laborByDigit[digit] = (laborByDigit[digit] ?? 0) + labor;
      }
      if (digit && Number.isFinite(hours) && hours > 0) {
        laborHoursByDigit[digit] =
          (laborHoursByDigit[digit] ?? 0) + hours;
      }
      if (digit && Number.isFinite(qty) && qty > 0) {
        quantityByDigit[digit] = (quantityByDigit[digit] ?? 0) + qty;
      }
    } else if (r.section === "SUPPORT_LABOR") {
      craftSupportLabor += labor;
      if (Number.isFinite(hours) && hours > 0) {
        craftSupportLaborHours += hours;
      }
    } else if (r.section === "MATERIALS") {
      if (Number.isFinite(qty) && Number.isFinite(matCost) && digit) {
        materialsByDigit[digit] =
          (materialsByDigit[digit] ?? 0) + qty * matCost;
      }
    }
  }

  return {
    laborByDigit,
    laborHoursByDigit,
    quantityByDigit,
    craftSupportLabor,
    craftSupportLaborHours,
    materialsByDigit,
  };
}

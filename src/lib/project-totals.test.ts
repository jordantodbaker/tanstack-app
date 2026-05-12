import { describe, expect, it } from "vitest";
import {
  accumulateProjectTotals,
  type ProjectTotalsRow,
} from "./project-totals";

function row(overrides: Partial<ProjectTotalsRow>): ProjectTotalsRow {
  return {
    discipline: "",
    section: "TAKE_OFF",
    cbsCode: "",
    quantity: "0",
    laborHours: "0",
    laborRate: "0",
    materialCost: "0",
    ...overrides,
  };
}

describe("accumulateProjectTotals", () => {
  it("returns all-zero/empty buckets when given no rows", () => {
    const totals = accumulateProjectTotals([]);
    expect(totals.laborByDigit).toEqual({});
    expect(totals.laborHoursByDigit).toEqual({});
    expect(totals.quantityByDigit).toEqual({});
    expect(totals.materialsByDigit).toEqual({});
    expect(totals.craftSupportLabor).toBe(0);
    expect(totals.craftSupportLaborHours).toBe(0);
  });

  describe("digit resolution priority", () => {
    it("prefers the first character of cbsCode over the discipline mapping", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "piping", // would map to "6"
          cbsCode: "201", // first char "2" wins
          quantity: "10",
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "2": 200 });
      expect(totals.laborHoursByDigit).toEqual({ "2": 4 });
      expect(totals.quantityByDigit).toEqual({ "2": 10 });
      expect(totals.laborByDigit["6"]).toBeUndefined();
    });

    it("falls back to DISCIPLINE_TO_DIGIT when cbsCode is empty or null", () => {
      const totals = accumulateProjectTotals([
        row({
          discipline: "coatings",
          cbsCode: "",
          quantity: "1",
          laborHours: "1",
          laborRate: "100",
        }),
        row({
          discipline: "electric",
          cbsCode: null,
          quantity: "2",
          laborHours: "2",
          laborRate: "100",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "9": 100, "7": 200 });
    });

    it("falls back to the discipline's leading digit when discipline is itself a numeric code", () => {
      // For MATERIALS rows the seed sets `discipline` to the L1 code like "601".
      const totals = accumulateProjectTotals([
        row({
          discipline: "601",
          section: "MATERIALS",
          cbsCode: "",
          quantity: "3",
          materialCost: "10",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({ "6": 30 });
    });

    it("drops TAKE_OFF rows that produce no digit at all", () => {
      const totals = accumulateProjectTotals([
        row({
          discipline: "unknown-discipline",
          cbsCode: "",
          quantity: "5",
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({});
      expect(totals.laborHoursByDigit).toEqual({});
      expect(totals.quantityByDigit).toEqual({});
    });
  });

  describe("TAKE_OFF section", () => {
    it("sums labor cost, labor hours, and quantity by digit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "10",
          laborHours: "4",
          laborRate: "50",
        }),
        row({
          section: "TAKE_OFF",
          cbsCode: "699",
          quantity: "5",
          laborHours: "2",
          laborRate: "100",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "6": 4 * 50 + 2 * 100 });
      expect(totals.laborHoursByDigit).toEqual({ "6": 6 });
      expect(totals.quantityByDigit).toEqual({ "6": 15 });
    });

    it("only adds labor cost when hours > 0 (independent of qty)", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "0", // qty is zero
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      // labor cost should still count even when qty is zero
      expect(totals.laborByDigit).toEqual({ "6": 200 });
      expect(totals.laborHoursByDigit).toEqual({ "6": 4 });
      // qty is skipped because it isn't > 0
      expect(totals.quantityByDigit).toEqual({});
    });

    it("skips labor cost when hours are zero or rate is non-numeric", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "5",
          laborHours: "0",
          laborRate: "50",
        }),
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "5",
          laborHours: "3",
          laborRate: "abc",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({});
      // quantity is still summed
      expect(totals.quantityByDigit).toEqual({ "6": 10 });
      // hours from the first row (0) is skipped; second row (3) is added
      expect(totals.laborHoursByDigit).toEqual({ "6": 3 });
    });
  });

  describe("SUPPORT_LABOR section", () => {
    it("accumulates into craftSupportLabor / craftSupportLaborHours regardless of digit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          cbsCode: "",
          laborHours: "10",
          laborRate: "75",
        }),
        row({
          section: "SUPPORT_LABOR",
          discipline: "electric",
          cbsCode: "701",
          laborHours: "5",
          laborRate: "80",
        }),
      ]);
      expect(totals.craftSupportLabor).toBe(10 * 75 + 5 * 80);
      expect(totals.craftSupportLaborHours).toBe(15);
      // SUPPORT_LABOR should NOT pollute the per-digit buckets
      expect(totals.laborByDigit).toEqual({});
      expect(totals.laborHoursByDigit).toEqual({});
    });

    it("skips hours when not finite or not positive", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "0",
          laborRate: "75",
        }),
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "abc",
          laborRate: "75",
        }),
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "4",
          laborRate: "75",
        }),
      ]);
      expect(totals.craftSupportLaborHours).toBe(4);
    });
  });

  describe("MATERIALS section", () => {
    it("accumulates qty * materialCost into materialsByDigit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "601",
          cbsCode: "",
          quantity: "10",
          materialCost: "5",
        }),
        row({
          section: "MATERIALS",
          discipline: "699",
          cbsCode: "",
          quantity: "2",
          materialCost: "25",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({ "6": 10 * 5 + 2 * 25 });
    });

    it("skips rows with non-numeric qty or materialCost", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "601",
          quantity: "abc",
          materialCost: "5",
        }),
        row({
          section: "MATERIALS",
          discipline: "601",
          quantity: "10",
          materialCost: "abc",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({});
    });

    it("skips rows that cannot resolve a digit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "unknown",
          cbsCode: "",
          quantity: "10",
          materialCost: "5",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({});
    });
  });

  it("does not cross-pollute buckets across the three sections", () => {
    const totals = accumulateProjectTotals([
      row({
        section: "TAKE_OFF",
        cbsCode: "601",
        quantity: "10",
        laborHours: "4",
        laborRate: "50",
      }),
      row({
        section: "SUPPORT_LABOR",
        discipline: "piping",
        laborHours: "8",
        laborRate: "75",
      }),
      row({
        section: "MATERIALS",
        discipline: "601",
        quantity: "5",
        materialCost: "20",
      }),
    ]);
    expect(totals.laborByDigit).toEqual({ "6": 200 });
    expect(totals.craftSupportLabor).toBe(600);
    expect(totals.materialsByDigit).toEqual({ "6": 100 });
  });
});

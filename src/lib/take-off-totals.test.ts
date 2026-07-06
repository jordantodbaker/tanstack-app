import { describe, expect, it } from "vitest";
import { computeTakeOffTotals } from "./take-off-totals";
import { makeFefRow } from "./fef-helpers";

describe("computeTakeOffTotals", () => {
  it("is all zero for no rows", () => {
    expect(computeTakeOffTotals([])).toEqual({
      itemCount: 0,
      laborHours: 0,
      laborCost: 0,
    });
  });

  it("sums hours and cost (hours × rate) across rows", () => {
    const totals = computeTakeOffTotals([
      makeFefRow({ id: "601-...", laborHours: "10", laborRate: "50" }),
      makeFefRow({ id: "602-...", laborHours: "4", laborRate: "25" }),
    ]);
    expect(totals).toEqual({
      itemCount: 2,
      laborHours: 14,
      laborCost: 10 * 50 + 4 * 25, // 600
    });
  });

  it("ignores blank template rows (trailing auto-appended blank)", () => {
    const totals = computeTakeOffTotals([
      makeFefRow({ id: "601-...", laborHours: "10", laborRate: "50" }),
      makeFefRow({ id: "__fe-blank-7" }), // empty template
    ]);
    expect(totals.itemCount).toBe(1);
    expect(totals.laborCost).toBe(500);
  });

  it("counts a started blank row and a code-less data row", () => {
    const totals = computeTakeOffTotals([
      makeFefRow({ id: "__fe-blank-1", laborHours: "5", laborRate: "10" }),
      makeFefRow({ id: "", name: "Note", laborHours: "2", laborRate: "10" }),
    ]);
    expect(totals.itemCount).toBe(2);
    expect(totals.laborHours).toBe(7);
    expect(totals.laborCost).toBe(5 * 10 + 2 * 10);
  });

  it("adds hours but no cost when the rate is missing", () => {
    const totals = computeTakeOffTotals([
      makeFefRow({ id: "601-...", laborHours: "8", laborRate: "" }),
    ]);
    expect(totals.itemCount).toBe(1);
    expect(totals.laborHours).toBe(8);
    expect(totals.laborCost).toBe(0);
  });

  it("coerces non-numeric labor fields to 0", () => {
    const totals = computeTakeOffTotals([
      makeFefRow({ id: "601-...", laborHours: "abc", laborRate: "xyz" }),
    ]);
    expect(totals).toMatchObject({ itemCount: 1, laborHours: 0, laborCost: 0 });
  });
});

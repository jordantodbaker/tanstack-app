import { describe, expect, it } from "vitest";
import {
  cleanNumber,
  computeLaborHours,
  computeTotalCost,
  computeUnitCost,
  computeUnitHours,
  DEFAULT_LABOR_FACTOR,
  effectiveLaborFactor,
  normalizeCode,
} from "./fef-derive";

describe("computeLaborHours", () => {
  it("multiplies quantity by the factor, to 1dp", () => {
    expect(computeLaborHours("10", "3")).toBe("30.0");
    expect(computeLaborHours("2.5", "1.5")).toBe("3.8");
  });

  // The three former copies disagreed on this: the cell editors relied on
  // callers pre-resolving the default, the range/paste copies applied it
  // themselves. The merged helper always applies it.
  it("treats a blank factor as the default", () => {
    expect(computeLaborHours("10", "")).toBe("10.0");
    expect(computeLaborHours("10", DEFAULT_LABOR_FACTOR)).toBe("10.0");
  });

  it("returns '' when either input isn't numeric", () => {
    expect(computeLaborHours("", "3")).toBe("");
    expect(computeLaborHours("abc", "3")).toBe("");
    expect(computeLaborHours("10", "abc")).toBe("");
  });
});

describe("effectiveLaborFactor", () => {
  it("falls back to the default only for a blank stored factor", () => {
    expect(effectiveLaborFactor("")).toBe(DEFAULT_LABOR_FACTOR);
    expect(effectiveLaborFactor("2.5")).toBe("2.5");
    expect(effectiveLaborFactor("0")).toBe("0");
  });
});

describe("cleanNumber / normalizeCode", () => {
  it("strips currency, separators, and whitespace", () => {
    expect(cleanNumber("1,200")).toBe("1200");
    expect(cleanNumber("$45.00")).toBe("45.00");
    expect(cleanNumber(" 12 ")).toBe("12");
    expect(cleanNumber("")).toBe("");
  });

  it("matches CBS codes regardless of hyphens or case", () => {
    expect(normalizeCode("601-10-0000-00-L")).toBe("60110000000l");
    expect(normalizeCode("60110000000L")).toBe("60110000000l");
    expect(normalizeCode(" 601 10 ")).toBe("60110");
  });
});

describe("computeTotalCost", () => {
  it("multiplies hours by rate", () => {
    expect(computeTotalCost("10", "55")).toBe("550.00");
  });

  it("is blank when either side is missing", () => {
    // Blank, not "0.00" — an unpriced line must not read as a free one.
    expect(computeTotalCost("", "55")).toBe("");
    expect(computeTotalCost("10", "")).toBe("");
    expect(computeTotalCost("", "")).toBe("");
  });
});

describe("computeUnitCost", () => {
  it("spreads the total cost over the quantity", () => {
    // 10 hrs x $55 = $550 across 20 units = $27.50 to install one.
    expect(computeUnitCost("10", "55", "20")).toBe("27.50");
  });

  it("equals the total cost at a quantity of one", () => {
    expect(computeUnitCost("8", "40", "1")).toBe("320.00");
    expect(computeUnitCost("8", "40", "1")).toBe(computeTotalCost("8", "40"));
  });

  it("is blank at zero or negative quantity rather than dividing", () => {
    // Not Infinity, and not 0.00 — there is nothing to spread the cost over.
    expect(computeUnitCost("10", "55", "0")).toBe("");
    expect(computeUnitCost("10", "55", "-4")).toBe("");
  });

  it("is blank when the line is not taken off or not priced yet", () => {
    expect(computeUnitCost("10", "55", "")).toBe("");
    expect(computeUnitCost("", "55", "20")).toBe("");
    expect(computeUnitCost("10", "", "20")).toBe("");
  });

  it("rounds to cents", () => {
    // 1 hr x $10 over 3 units = 3.333…
    expect(computeUnitCost("1", "10", "3")).toBe("3.33");
  });
});

describe("computeUnitHours", () => {
  it("spreads labor hours over the quantity", () => {
    // 50 hrs across 20 units = 2.50 hrs to install one.
    expect(computeUnitHours("50", "20")).toBe("2.50");
  });

  it("equals the labor hours at a quantity of one", () => {
    expect(computeUnitHours("8", "1")).toBe("8.00");
  });

  it("does not need a rate — unlike the cost figure", () => {
    // An unpriced line still has a productivity rate, which is the point of
    // reporting hours per unit separately from cost per unit.
    expect(computeUnitHours("50", "20")).toBe("2.50");
    expect(computeUnitCost("50", "", "20")).toBe("");
  });

  it("is blank at zero or negative quantity rather than dividing", () => {
    expect(computeUnitHours("50", "0")).toBe("");
    expect(computeUnitHours("50", "-2")).toBe("");
  });

  it("is blank when hours or quantity are missing", () => {
    expect(computeUnitHours("", "20")).toBe("");
    expect(computeUnitHours("50", "")).toBe("");
  });

  it("rounds to two places", () => {
    expect(computeUnitHours("10", "3")).toBe("3.33");
  });
});

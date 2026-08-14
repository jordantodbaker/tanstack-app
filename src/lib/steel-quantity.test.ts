import { describe, it, expect } from "vitest";
import { computeSteelQuantity, computeTotalTons } from "./fef-cells";

describe("computeSteelQuantity", () => {
  it("multiplies # of shapes by length (L)", () => {
    expect(computeSteelQuantity("3", "20")).toBe("60");
    expect(computeSteelQuantity("2", "10.5")).toBe("21");
  });

  it("strips floating-point noise", () => {
    expect(computeSteelQuantity("3", "20.1")).toBe("60.3");
  });

  it("returns '' when either input isn't a number", () => {
    expect(computeSteelQuantity("", "20")).toBe("");
    expect(computeSteelQuantity("3", "")).toBe("");
    expect(computeSteelQuantity("abc", "20")).toBe("");
  });
});

describe("computeTotalTons", () => {
  it("multiplies derived quantity (# shapes × L) by TNS/Unit", () => {
    // qty = 3 × 20 = 60; 60 × 0.044 = 2.64
    expect(computeTotalTons("3", "20", 0.044)).toBe("2.64");
  });

  it("returns '' when the member has no TNS/Unit", () => {
    expect(computeTotalTons("3", "20", null)).toBe("");
    expect(computeTotalTons("3", "20", undefined)).toBe("");
  });

  it("returns '' when the quantity can't be computed", () => {
    expect(computeTotalTons("", "20", 0.044)).toBe("");
    expect(computeTotalTons("3", "", 0.044)).toBe("");
  });
});

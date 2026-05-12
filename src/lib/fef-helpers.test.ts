import { describe, expect, it } from "vitest";
import { canComputeTotalCost, toCbsOption } from "./fef-helpers";
import type { FefRow } from "./types";

function row(overrides: Partial<FefRow>): FefRow {
  return {
    id: "0",
    name: "",
    description: "",
    shopField: "",
    weldGroupDescription: "",
    quantity: "",
    size: "",
    unit: "",
    metallurgyCode: "",
    boreSize: "",
    role: "",
    schedule: "",
    taskCode: "",
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
    sub: "",
    ...overrides,
  };
}

describe("canComputeTotalCost", () => {
  it("returns true when hours > 0 and rate is a parseable non-empty string", () => {
    expect(
      canComputeTotalCost(row({ laborHours: "4", laborRate: "50" })),
    ).toBe(true);
    expect(
      canComputeTotalCost(row({ laborHours: "0.5", laborRate: "75.25" })),
    ).toBe(true);
  });

  it("returns false when hours are zero or negative", () => {
    expect(
      canComputeTotalCost(row({ laborHours: "0", laborRate: "50" })),
    ).toBe(false);
    expect(
      canComputeTotalCost(row({ laborHours: "-1", laborRate: "50" })),
    ).toBe(false);
  });

  it("returns false when hours are not numeric", () => {
    expect(
      canComputeTotalCost(row({ laborHours: "abc", laborRate: "50" })),
    ).toBe(false);
    expect(
      canComputeTotalCost(row({ laborHours: "", laborRate: "50" })),
    ).toBe(false);
  });

  it("returns false when the rate string is empty even if hours are positive", () => {
    expect(
      canComputeTotalCost(row({ laborHours: "4", laborRate: "" })),
    ).toBe(false);
  });

  it("returns false when the rate string is not parseable", () => {
    expect(
      canComputeTotalCost(row({ laborHours: "4", laborRate: "abc" })),
    ).toBe(false);
  });

  it("returns true when the rate string parses to zero (a valid known rate)", () => {
    // "0" is a legitimate authored rate (e.g. owner-furnished labor).
    expect(
      canComputeTotalCost(row({ laborHours: "4", laborRate: "0" })),
    ).toBe(true);
  });
});

describe("toCbsOption", () => {
  it("copies displayCode, costCode, uom, and displayDescription verbatim", () => {
    const opt = toCbsOption({
      displayCode: "601-01",
      costCode: "C-601",
      name: "Pipe Fab",
      uom: "LF",
      displayDescription: "601-01: Pipe Fab (LF)",
      subReporting: true,
    });
    expect(opt.displayCode).toBe("601-01");
    expect(opt.costCode).toBe("C-601");
    expect(opt.uom).toBe("LF");
    expect(opt.displayDescription).toBe("601-01: Pipe Fab (LF)");
    expect(opt.subReporting).toBe(true);
  });

  it("falls back to an empty string for a null name", () => {
    const opt = toCbsOption({
      displayCode: "X",
      name: null,
      uom: "EA",
    });
    expect(opt.name).toBe("");
  });

  it("preserves a populated name", () => {
    const opt = toCbsOption({
      displayCode: "X",
      name: "Conduit",
      uom: "LF",
    });
    expect(opt.name).toBe("Conduit");
  });

  it("defaults displayDescription to null when absent or undefined", () => {
    const opt = toCbsOption({ displayCode: "X", name: "n", uom: "EA" });
    expect(opt.displayDescription).toBeNull();

    const opt2 = toCbsOption({
      displayCode: "X",
      name: "n",
      uom: "EA",
      displayDescription: undefined,
    });
    expect(opt2.displayDescription).toBeNull();
  });

  it("forwards subReporting false vs. null vs. undefined correctly", () => {
    expect(
      toCbsOption({
        displayCode: "X",
        name: "n",
        uom: "EA",
        subReporting: false,
      }).subReporting,
    ).toBe(false);
    expect(
      toCbsOption({
        displayCode: "X",
        name: "n",
        uom: "EA",
        subReporting: null,
      }).subReporting,
    ).toBeNull();
    expect(
      toCbsOption({ displayCode: "X", name: "n", uom: "EA" }).subReporting,
    ).toBeNull();
  });

  it("omits costCode in the output when the input has none", () => {
    const opt = toCbsOption({ displayCode: "X", name: "n", uom: "EA" });
    expect(opt.costCode).toBeUndefined();
  });
});

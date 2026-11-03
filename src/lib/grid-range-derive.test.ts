import { describe, expect, it } from "vitest";
import { makeFefRow } from "./fef-helpers";
import {
  deriveRowPatch,
  parseCellValue,
  resolveCellWrite,
  writeCtxFromMeta,
} from "./grid-range";

/**
 * The cell editors call `deriveRowPatch` with a stored value; a paste calls
 * `parseCellValue` and then the same `deriveRowPatch`. These pin the split:
 * for a value a picker could have produced, typing it and pasting it are the
 * same write, and a value no picker offers derives to nothing.
 */

const ctx = writeCtxFromMeta({
  roleOptions: ["Pipefitter", "Welder"],
  scheduleOptions: ["1x5x8", "1x6x10"],
  roleRates: [
    { roleName: "Pipefitter", schedule: "1x5x8", rate: 60 },
    { roleName: "Welder", schedule: "1x6x10", rate: 72.5 },
  ],
  areaOptions: [{ value: "7", label: "A-07 — Pipe Rack" }],
  crewMixOptions: [
    {
      id: 3,
      name: "Fit crew",
      schedule: "1x5x8",
      members: [{ roleName: "Pipefitter", count: 2 }],
    },
  ],
  cbsOptions: [
    {
      displayCode: "SHOPCS-MB-0000-MB-L",
      costCode: "SHOPCSMB0000MBL",
      name: "Shop Fab CS Medium Bore",
      uom: "LF",
      displayDescription: null,
      subReporting: null,
    },
  ],
  pipingFactorLookup: new Map([
    ["WLD-CS", { unit: "EA", values: new Map([[4, 0.5]]) }],
  ]),
  weldGroupMaterialMap: {
    "CS 150#": { shopCode: "SHOPCS", installCode: "FLDCS" },
  },
});

const row = makeFefRow({
  role: "Pipefitter",
  schedule: "1x5x8",
  laborRate: "60",
  weldGroupDescription: "CS 150#",
  shopField: "Shop",
  metallurgyCode: "SHOPCS",
  size: "4",
  boreSize: "MB",
  taskCode: "WLD-CS",
  quantity: "2",
});

describe("deriveRowPatch — what an editor writes is what a paste writes", () => {
  it.each([
    ["role", "Welder"],
    ["schedule", "1x6x10"],
    ["crewMixId", "3"],
    ["shopField", "Field"],
    ["fabricateErect", "Erect"],
    ["weldGroupDescription", "CS 150#"],
    ["taskCode", "WLD-CS"],
    ["size", "6"],
    ["quantity", "3"],
    ["area", "7"],
    ["materialType", "Tagged"],
  ])("%s", (colId, value) => {
    expect(deriveRowPatch(colId, value, row, ctx)).toEqual(
      resolveCellWrite(colId, value, row, ctx),
    );
  });

  it("derives the coupled fields, not just the one edited", () => {
    expect(deriveRowPatch("schedule", "1x6x10", row, ctx)).toEqual({
      schedule: "1x6x10",
      laborRate: "", // Pipefitter has no 1x6x10 rate
    });
    expect(deriveRowPatch("quantity", "3", row, ctx)).toEqual({
      quantity: "3",
      laborHours: "1.5",
    });
    expect(deriveRowPatch("crewMixId", "3", row, ctx)).toEqual({
      crewMixId: "3",
      laborRate: "60.00",
      role: "",
      schedule: "",
    });
  });

  it("derives nothing for a value no picker could have produced", () => {
    expect(deriveRowPatch("crewMixId", "99", row, ctx)).toBeNull();
    expect(deriveRowPatch("taskCode", "NOPE", row, ctx)).toBeNull();
    expect(deriveRowPatch("laborHours", "5", row, ctx)).toBeNull();
  });
});

describe("parseCellValue — text to the stored value", () => {
  it("resolves picker text case-insensitively, and by either name or id", () => {
    expect(parseCellValue("role", " welder ", ctx)).toBe("Welder");
    expect(parseCellValue("shopField", "FIELD", ctx)).toBe("Field");
    expect(parseCellValue("crewMixId", "fit crew", ctx)).toBe("3");
    expect(parseCellValue("area", "a-07 — pipe rack", ctx)).toBe("7");
    expect(parseCellValue("name", "shopcsmb0000mbl", ctx)).toBeNull(); // piping: derived
  });

  it("returns null for text no picker offers, and blank for blank", () => {
    expect(parseCellValue("role", "Plumber", ctx)).toBeNull();
    expect(parseCellValue("materialType", "tag", ctx)).toBeNull();
    expect(parseCellValue("role", "", ctx)).toBe("");
    expect(parseCellValue("sub", "Yes", ctx)).toBe("true");
  });
});

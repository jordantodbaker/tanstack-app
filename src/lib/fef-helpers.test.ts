import { describe, expect, it } from "vitest";
import {
  FEF_ROW_STRING_FIELDS,
  canComputeTotalCost,
  fefRowHasUserData,
  makeFefRow,
  toCbsOption,
} from "./fef-helpers";
import type { FefRow } from "./types";

const row = (overrides: Partial<FefRow>): FefRow =>
  makeFefRow({ id: "0", ...overrides });

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

describe("makeFefRow", () => {
  // Independent enumeration of every FefRow key. This is the second witness
  // that FEF_ROW_STRING_FIELDS stays complete: if a field is added to the
  // FefRow type, both this list and FEF_ROW_STRING_FIELDS must be updated,
  // and the "key set" test below asserts the two agree.
  const EXPECTED_KEYS = [
    "id",
    "name",
    "description",
    "shopField",
    "weldGroupDescription",
    "quantity",
    "size",
    "unit",
    "metallurgyCode",
    "boreSize",
    "role",
    "schedule",
    "taskCode",
    "laborHours",
    "laborRate",
    "materialCost",
    "equipment",
    "notes",
    "sub",
  ];

  it("returns a row with id and every string field blank", () => {
    const r = makeFefRow();
    expect(r.id).toBe("");
    for (const f of FEF_ROW_STRING_FIELDS) {
      expect(r[f]).toBe("");
    }
  });

  it("applies partial overrides over the blank base", () => {
    const r = makeFefRow({ id: "601-01", name: "Pipe Fab", laborHours: "8" });
    expect(r.id).toBe("601-01");
    expect(r.name).toBe("Pipe Fab");
    expect(r.laborHours).toBe("8");
    // Untouched fields stay blank.
    expect(r.description).toBe("");
    expect(r.sub).toBe("");
  });

  it("produces exactly the FefRow key set — guards against field drift", () => {
    expect(Object.keys(makeFefRow()).sort()).toEqual(
      [...EXPECTED_KEYS].sort(),
    );
    // FEF_ROW_STRING_FIELDS is every key except `id`.
    expect([...FEF_ROW_STRING_FIELDS].sort()).toEqual(
      EXPECTED_KEYS.filter((k) => k !== "id").sort(),
    );
  });

  it("does not share field references between calls", () => {
    const a = makeFefRow();
    const b = makeFefRow();
    expect(a).not.toBe(b);
    a.name = "mutated";
    expect(b.name).toBe("");
  });
});

describe("fefRowHasUserData", () => {
  it("returns false for a fully blank row", () => {
    expect(fefRowHasUserData(makeFefRow())).toBe(false);
  });

  it("returns false when only the id is set", () => {
    // id is not a free-text field — a placeholder/blank row with just an id
    // still counts as empty.
    expect(fefRowHasUserData(makeFefRow({ id: "__fe-blank-3" }))).toBe(false);
  });

  it("returns true when any free-text field holds data", () => {
    for (const f of FEF_ROW_STRING_FIELDS) {
      expect(fefRowHasUserData(makeFefRow({ [f]: "x" }))).toBe(true);
    }
  });
});

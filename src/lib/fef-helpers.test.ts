import { describe, expect, it } from "vitest";
import {
  FEF_ROW_STRING_FIELDS,
  canComputeTotalCost,
  fefRowHasUserData,
  isTakeOffRowInvalid,
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
    "crewMixId",
    "schedule",
    "taskCode",
    "laborHours",
    "laborFactor",
    "laborRate",
    "materialCost",
    "equipment",
    "notes",
    "sub",
    "area",
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

describe("isTakeOffRowInvalid", () => {
  const blank = {
    quantity: "",
    laborHours: "",
    laborRate: "",
    materialCost: "",
  };

  it("returns false for an untouched blank-template row (client form)", () => {
    expect(
      isTakeOffRowInvalid({ id: "__fe-blank-3", ...blank }),
    ).toBe(false);
  });

  it("returns false for a row with no started signals (server form)", () => {
    expect(isTakeOffRowInvalid({ cbsCode: "", name: "", ...blank })).toBe(
      false,
    );
  });

  it("flags a CBS-coded row that has no labor", () => {
    // Client representation: id holds the CBS code, no blank-prefix.
    expect(isTakeOffRowInvalid({ id: "601-01", ...blank })).toBe(true);
    // Server representation: cbsCode column non-empty.
    expect(
      isTakeOffRowInvalid({ cbsCode: "601-01", ...blank }),
    ).toBe(true);
  });

  it("flags a row where the user typed only a name", () => {
    expect(isTakeOffRowInvalid({ name: "Pipe Fab", ...blank })).toBe(true);
  });

  it("flags a row where the user picked only a schedule", () => {
    // Any picker counts as "started" — this is the case that motivated
    // generalizing the rule beyond the cost-relevant fields.
    expect(isTakeOffRowInvalid({ schedule: "ST", ...blank })).toBe(true);
  });

  it("flags a row where the user picked only a role", () => {
    expect(isTakeOffRowInvalid({ role: "Pipefitter", ...blank })).toBe(true);
  });

  it("flags a row where the user picked only a task code", () => {
    expect(isTakeOffRowInvalid({ taskCode: "INST-PIPE", ...blank })).toBe(
      true,
    );
  });

  it("flags a row where the user typed only a note", () => {
    expect(isTakeOffRowInvalid({ notes: "needs cap", ...blank })).toBe(true);
  });

  it("flags a row with hours but no rate", () => {
    expect(
      isTakeOffRowInvalid({ ...blank, laborHours: "4" }),
    ).toBe(true);
  });

  it("flags a row with rate but no hours", () => {
    expect(
      isTakeOffRowInvalid({ ...blank, laborRate: "50" }),
    ).toBe(true);
  });

  it("flags a row with zero hours (not strictly positive)", () => {
    expect(
      isTakeOffRowInvalid({ ...blank, laborHours: "0", laborRate: "50" }),
    ).toBe(true);
  });

  it("passes a row with positive hours and a parseable rate", () => {
    expect(
      isTakeOffRowInvalid({
        id: "601-01",
        ...blank,
        laborHours: "4",
        laborRate: "50",
      }),
    ).toBe(false);
  });

  it("flags a row with non-numeric labor entries", () => {
    expect(
      isTakeOffRowInvalid({
        ...blank,
        laborHours: "abc",
        laborRate: "50",
      }),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  CUSTOM_FIELD_SLOTS,
  CUSTOM_FIELD_SLOT_COUNT,
  FEF_DATA_COLUMNS,
  FEF_ROW_STRING_FIELDS,
  customFieldForSlot,
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
    "fabricateErect",
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
    // Reference
    "projectPhase",
    "drawingNumber",
    "drawingRev",
    "processUnit",
    "areaName",
    "systemName",
    "tagNumber",
    // Spec & testing
    "lineSpec",
    "paintSpec",
    "insulation",
    "nde",
    "pwht",
    "hydro",
    "heatTrace",
    // Location
    "agUg",
    "elevation",
    // Dimensions
    "height",
    "width",
    "length",
    "shapeCount",
    // Labor adjustments
    "siteFactor",
    "feetAboveGrade",
    "efficAdjust",
    "laborFactorAdj",
    "elevAdder",
    "weldAdder",
    // User-defined take-off columns. Listed out rather than generated from
    // CUSTOM_FIELD_SLOTS on purpose — this list is an INDEPENDENT witness, so
    // deriving it from the source it guards would make the test vacuous.
    "custom1",
    "custom2",
    "custom3",
    "custom4",
    "custom5",
    "custom6",
    "custom7",
    "custom8",
    "custom9",
    "custom10",
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

/**
 * The custom-column slots.
 *
 * The design bet is that making them ordinary entries in
 * `FEF_ROW_STRING_FIELDS` gets every derived behaviour for free. These assert
 * that bet directly — if a future change special-cases them out of the array,
 * or a JSON-blob refactor moves the data elsewhere, these fail rather than the
 * breakage showing up as silently dropped estimator data.
 */
describe("custom field slots", () => {
  it("exposes one slot name per declared slot", () => {
    expect(CUSTOM_FIELD_SLOTS).toHaveLength(CUSTOM_FIELD_SLOT_COUNT);
    expect(new Set(CUSTOM_FIELD_SLOTS).size).toBe(CUSTOM_FIELD_SLOT_COUNT);
  });

  it("maps a 1-based slot number to its field", () => {
    expect(customFieldForSlot(1)).toBe("custom1");
    expect(customFieldForSlot(10)).toBe("custom10");
  });

  it("has no field for a slot outside the range", () => {
    // Guards the off-by-one: slot 0 and slot 11 must not silently resolve.
    expect(customFieldForSlot(0)).toBeUndefined();
    expect(customFieldForSlot(11)).toBeUndefined();
    expect(customFieldForSlot(-1)).toBeUndefined();
  });

  it("is part of the row field list, so everything derived includes it", () => {
    for (const slot of CUSTOM_FIELD_SLOTS) {
      expect(FEF_ROW_STRING_FIELDS).toContain(slot);
    }
  });

  it("blanks like every other field on a new row", () => {
    const r = makeFefRow();
    for (const slot of CUSTOM_FIELD_SLOTS) expect(r[slot]).toBe("");
  });

  it("counts as user data — a row with ONLY custom data must survive a save", () => {
    // This is the property a JSON side-channel would have got wrong.
    // `saveFefRows` drops blank template rows; if custom values didn't register
    // as user data, an estimator could fill a custom column, autosave, and lose
    // the row.
    expect(fefRowHasUserData(makeFefRow({ custom1: "CT-4471" }))).toBe(true);
    expect(fefRowHasUserData(makeFefRow({ custom10: "x" }))).toBe(true);
  });

  it("is carried by the DB data columns, so the write SQL includes it", () => {
    for (const slot of CUSTOM_FIELD_SLOTS) {
      expect(FEF_DATA_COLUMNS).toContain(slot);
    }
  });
});

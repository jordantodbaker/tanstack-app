import { describe, expect, it } from "vitest";
import { makeFefRow } from "./fef-helpers";
import {
  normalizeRange,
  rangeSpansMultiple,
  resolveCellWrite,
  readCellText,
  serializeRange,
  parseClipboardMatrix,
  applyPaste,
  applyClear,
  applyFillDown,
  type RangeSelection,
  type WriteCtx,
} from "./grid-range";

const ctx: WriteCtx = {
  roleOptions: ["Pipefitter", "Welder"],
  scheduleOptions: ["ST", "OT"],
  roleRates: [
    { roleName: "Pipefitter", schedule: "ST", rate: 55 },
    { roleName: "Welder", schedule: "OT", rate: 90 },
    // Used by the crew-mix fixtures below (kept distinct from the role/schedule
    // cases above so those assertions are unaffected).
    { roleName: "Foreman", schedule: "ST", rate: 60 },
    { roleName: "Laborer", schedule: "ST", rate: 40 },
  ],
  areaOptions: [
    { value: "1", label: "A-100 — Boiler" },
    { value: "2", label: "A-200 — Turbine" },
  ],
  cbsOptions: [
    {
      displayCode: "601-10-0000-00-L",
      costCode: "6011000000L",
      name: "3in Elbow",
      uom: "EA",
      displayDescription: null,
    },
    {
      displayCode: "602-20-0000-00-L",
      name: "6in Tee",
      uom: "EA",
      displayDescription: null,
    },
  ],
  crewMixOptions: [
    {
      id: 7,
      name: "Fab Crew A",
      schedule: "ST",
      members: [
        { roleName: "Foreman", count: 1 },
        { roleName: "Laborer", count: 1 },
      ],
    },
    { id: 8, name: "Empty Crew", schedule: "ST", members: [] },
  ],
};

// Column layout used across the tests (a slimmed Take Off order).
const COLS = [
  "description",
  "quantity",
  "laborFactor",
  "area",
  "role",
  "schedule",
  "laborHours",
  "notes",
];

const range = (
  ar: number,
  ac: number,
  fr: number,
  fc: number,
): RangeSelection => ({ anchor: { row: ar, col: ac }, focus: { row: fr, col: fc } });

describe("normalizeRange / rangeSpansMultiple", () => {
  it("orders swapped corners into a min/max rectangle", () => {
    expect(normalizeRange(range(3, 5, 1, 2))).toEqual({
      minRow: 1,
      maxRow: 3,
      minCol: 2,
      maxCol: 5,
    });
  });

  it("detects single vs multi-cell selection", () => {
    expect(rangeSpansMultiple(range(2, 2, 2, 2))).toBe(false);
    expect(rangeSpansMultiple(range(2, 2, 2, 3))).toBe(true);
    expect(rangeSpansMultiple(range(2, 2, 4, 2))).toBe(true);
  });
});

describe("resolveCellWrite", () => {
  const row = makeFefRow({ quantity: "10", laborFactor: "2" });

  it("writes plain text columns verbatim", () => {
    expect(resolveCellWrite("notes", "hello", row, ctx)).toEqual({
      notes: "hello",
    });
  });

  it("recomputes labor hours when quantity changes", () => {
    // qty 5 × existing factor 2 = 10.0
    expect(resolveCellWrite("quantity", "5", row, ctx)).toEqual({
      quantity: "5",
      laborHours: "10.0",
    });
  });

  it("cleans currency/commas from numeric cells", () => {
    expect(resolveCellWrite("quantity", "1,200", row, ctx)).toEqual({
      quantity: "1200",
      laborHours: "2400.0",
    });
  });

  it("stores blank for the default labor factor and recomputes hours at 1x", () => {
    // factor "1" persists as "" ; hours = qty 10 × 1 = 10.0
    expect(resolveCellWrite("laborFactor", "1", row, ctx)).toEqual({
      laborFactor: "",
      laborHours: "10.0",
    });
  });

  it("resolves an area by id or by label, and skips unknowns", () => {
    expect(resolveCellWrite("area", "2", row, ctx)).toEqual({ area: "2" });
    expect(resolveCellWrite("area", "A-100 — Boiler", row, ctx)).toEqual({
      area: "1",
    });
    expect(resolveCellWrite("area", "nope", row, ctx)).toBeNull();
  });

  it("resolves role (case-insensitive) and snaps the labor rate", () => {
    const r = makeFefRow({ schedule: "ST" });
    expect(resolveCellWrite("role", "pipefitter", r, ctx)).toEqual({
      role: "Pipefitter",
      laborRate: "55",
    });
  });

  it("clears role and its rate on empty write", () => {
    const r = makeFefRow({ role: "Pipefitter", schedule: "ST" });
    expect(resolveCellWrite("role", "", r, ctx)).toEqual({
      role: "",
      laborRate: "",
    });
  });

  it("resolves a CBS item by code (hyphen-insensitive), cost code, or name", () => {
    expect(resolveCellWrite("name", "601-10-0000-00-l", row, ctx)).toEqual({
      id: "601-10-0000-00-L",
      name: "3in Elbow",
      unit: "EA",
    });
    expect(resolveCellWrite("name", "6011000000L", row, ctx)).toEqual({
      id: "601-10-0000-00-L",
      name: "3in Elbow",
      unit: "EA",
    });
    expect(resolveCellWrite("name", "6in Tee", row, ctx)).toEqual({
      id: "602-20-0000-00-L",
      name: "6in Tee",
      unit: "EA",
    });
  });

  it("clears the CBS item (id/name/unit) on empty write, skips unknowns", () => {
    expect(resolveCellWrite("name", "", row, ctx)).toEqual({
      id: "",
      name: "",
      unit: "",
    });
    expect(resolveCellWrite("name", "nonsense", row, ctx)).toBeNull();
  });

  it("resolves a crew mix (by id or name), averaging member-role rates at its schedule", () => {
    expect(resolveCellWrite("crewMixId", "Fab Crew A", row, ctx)).toEqual({
      crewMixId: "7",
      laborRate: "50.00", // avg(Foreman 60, Laborer 40) at schedule ST
      role: "",
      schedule: "",
    });
    expect(resolveCellWrite("crewMixId", "7", row, ctx)).toEqual({
      crewMixId: "7",
      laborRate: "50.00",
      role: "",
      schedule: "",
    });
  });

  it("clears the crew mix and rate on empty write", () => {
    const r = makeFefRow({ crewMixId: "7", laborRate: "50.00" });
    expect(resolveCellWrite("crewMixId", "", r, ctx)).toEqual({
      crewMixId: "",
      laborRate: "",
    });
  });

  it("returns null for non-writable columns", () => {
    expect(resolveCellWrite("laborHours", "5", row, ctx)).toBeNull();
    expect(resolveCellWrite("id", "x", row, ctx)).toBeNull();
    expect(resolveCellWrite("unit", "EA", row, ctx)).toBeNull();
  });
});

describe("readCellText", () => {
  it("hides blank-template ids and renders derived total cost", () => {
    const blank = makeFefRow({ id: "__fe-blank-3" });
    expect(readCellText("id", blank, ctx)).toBe("");
    const row = makeFefRow({ id: "601-X", laborHours: "10", laborRate: "5" });
    expect(readCellText("id", row, ctx)).toBe("601-X");
    expect(readCellText("totalCost", row, ctx)).toBe("50.00");
  });

  it("renders an area's label and a sub flag", () => {
    const row = makeFefRow({ area: "2", sub: "true" });
    expect(readCellText("area", row, ctx)).toBe("A-200 — Turbine");
    expect(readCellText("sub", row, ctx)).toBe("Yes");
  });
});

describe("serializeRange / parseClipboardMatrix round-trip", () => {
  it("serializes a rectangle as TSV rows", () => {
    const data = [
      makeFefRow({ description: "elbow", quantity: "3" }),
      makeFefRow({ description: "tee", quantity: "5" }),
    ];
    const tsv = serializeRange(data, COLS, range(0, 0, 1, 1), ctx);
    expect(tsv).toBe("elbow\t3\ntee\t5");
    expect(parseClipboardMatrix(tsv)).toEqual([
      ["elbow", "3"],
      ["tee", "5"],
    ]);
  });

  it("drops a single trailing newline from pasted text", () => {
    expect(parseClipboardMatrix("a\tb\n")).toEqual([["a", "b"]]);
  });
});

describe("applyPaste", () => {
  it("spills a block from the top-left, growing rows as needed", () => {
    const data = [makeFefRow({ id: "__fe-blank-0" })];
    const matrix = [
      ["elbow", "2"],
      ["tee", "4"],
    ];
    const next = applyPaste(
      data,
      COLS,
      { row: 0, col: 0 },
      matrix,
      ctx,
      (i) => makeFefRow({ id: `__fe-blank-p${i}` }),
    );
    expect(next).toHaveLength(2);
    expect(next[0].description).toBe("elbow");
    expect(next[0].quantity).toBe("2");
    expect(next[1].description).toBe("tee");
    expect(next[1].quantity).toBe("4");
  });

  it("leaves non-writable target columns untouched", () => {
    const data = [makeFefRow({ laborHours: "99" })];
    // Paste into laborHours (col 6) — not writable, should be ignored.
    const next = applyPaste(
      data,
      COLS,
      { row: 0, col: 6 },
      [["1"]],
      ctx,
      (i) => makeFefRow({ id: `p${i}` }),
    );
    expect(next[0].laborHours).toBe("99");
  });
});

describe("applyClear", () => {
  it("clears writable cells (and coupled derived fields) in the range", () => {
    const data = [
      makeFefRow({ description: "x", quantity: "5", laborHours: "5.0" }),
    ];
    const next = applyClear(data, COLS, range(0, 0, 0, 1), ctx);
    expect(next[0].description).toBe("");
    expect(next[0].quantity).toBe("");
    expect(next[0].laborHours).toBe("");
  });
});

describe("applyFillDown", () => {
  it("copies the top selected row down, recomputing per-row derived fields", () => {
    const data = [
      makeFefRow({ laborFactor: "3", quantity: "2", laborHours: "6.0" }),
      makeFefRow({ quantity: "10" }),
      makeFefRow({ quantity: "4" }),
    ];
    // Fill the labor-factor column (col 2) down over all three rows.
    const next = applyFillDown(data, COLS, range(0, 2, 2, 2), ctx);
    expect(next[1].laborFactor).toBe("3");
    expect(next[1].laborHours).toBe("30.0"); // 10 × 3
    expect(next[2].laborFactor).toBe("3");
    expect(next[2].laborHours).toBe("12.0"); // 4 × 3
    // Source row is unchanged.
    expect(next[0].laborHours).toBe("6.0");
  });
});

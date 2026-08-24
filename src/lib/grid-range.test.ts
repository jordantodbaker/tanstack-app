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
  selectionStats,
  insertRows,
  deleteRows,
  findMatches,
  replaceInCell,
  replaceAll,
  sortRows,
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

describe("fill-down over the non-derived take-off columns", () => {
  // The reference / spec / labor-adjustment columns are plain text: they were
  // silently skipped by Ctrl+D until they were added to RANGE_WRITABLE_COLUMNS.
  const PLAIN = [
    "projectPhase",
    "drawingNumber",
    "drawingRev",
    "processUnit",
    "areaName",
    "systemName",
    "tagNumber",
    "lineSpec",
    "paintSpec",
    "insulation",
    "nde",
    "pwht",
    "hydro",
    "heatTrace",
    "agUg",
    "elevation",
    "siteFactor",
    "feetAboveGrade",
    "efficAdjust",
    "laborFactorAdj",
    "elevAdder",
    "weldAdder",
    "height",
    "width",
  ] as const;

  it.each(PLAIN)("fills %s down the selection", (colId) => {
    const data = [makeFefRow({ [colId]: "SRC" }), makeFefRow(), makeFefRow()];
    const next = applyFillDown(data, [colId], range(0, 0, 2, 0), ctx);
    expect(next[1][colId]).toBe("SRC");
    expect(next[2][colId]).toBe("SRC");
  });

  it("fills the Sub checkbox, and round-trips its serialized 'Yes'", () => {
    const data = [makeFefRow({ sub: "true" }), makeFefRow(), makeFefRow()];
    const next = applyFillDown(data, ["sub"], range(0, 0, 2, 0), ctx);
    expect(next[1].sub).toBe("true");
    expect(next[2].sub).toBe("true");
    // Clipboard text ("Yes") resolves to the same stored value.
    expect(resolveCellWrite("sub", "Yes", makeFefRow(), ctx)).toEqual({
      sub: "true",
    });
    expect(resolveCellWrite("sub", "", makeFefRow({ sub: "true" }), ctx)).toEqual({
      sub: "",
    });
    // Anything else is unresolvable — leave the cell alone.
    expect(resolveCellWrite("sub", "maybe", makeFefRow(), ctx)).toBeNull();
  });

  it("recomputes steel Quantity when # of Shapes or L is filled down", () => {
    const data = [
      makeFefRow({ shapeCount: "3", length: "20", quantity: "60" }),
      makeFefRow({ length: "10" }),
    ];
    const next = applyFillDown(data, ["shapeCount"], range(0, 0, 1, 0), ctx);
    expect(next[1].shapeCount).toBe("3");
    expect(next[1].quantity).toBe("30"); // 3 × 10
    expect(next[1].laborHours).toBe("30.0"); // × default factor 1
  });
});

describe("piping-sheet range writes", () => {
  const pipingCtx: WriteCtx = {
    ...ctx,
    // Mirrors the real catalog's shapes: the shop code carries a "…ST0000C"
    // item, the install code carries a bore rollup instead and no "ST0000C" at
    // all. "NOCODE" stands for a metallurgy code the catalog doesn't cover.
    cbsOptions: [
      ...ctx.cbsOptions,
      {
        displayCode: "SHOPCS-MB-ST00-00-C",
        costCode: "SHOPCSMBST0000C",
        name: "Shop Fab CS Medium Bore Standard",
        uom: "LF",
        displayDescription: null,
        subReporting: null,
      },
      {
        displayCode: "FLDCS-MB-0000-MB-C",
        costCode: "FLDCSMB0000MBC",
        name: "Install CS Medium Bore",
        uom: "LF",
        displayDescription: null,
        subReporting: null,
      },
    ],
    pipingFactorLookup: new Map([
      ["WLD-CS", { unit: "EA", values: new Map([[4, 0.5], [6, 0.75]]) }],
    ]),
    weldGroupMaterialMap: {
      "CS 150#": { shopCode: "SHOPCS", installCode: "FLDCS" },
      "XS 150#": { shopCode: "SHOPCS", installCode: "NOCODE" },
    },
  };

  it("derives Labor Hours from the factor table, not quantity × labor factor", () => {
    const row = makeFefRow({ taskCode: "WLD-CS", size: "4", quantity: "10" });
    expect(resolveCellWrite("quantity", "20", row, pipingCtx)).toEqual({
      quantity: "20",
      laborHours: "10.0", // 20 × 0.5, the (WLD-CS, 4") factor
    });
  });

  it("fills Size down, recomputing bore size and Labor Hours per row", () => {
    const data = [
      makeFefRow({ taskCode: "WLD-CS", size: "6", quantity: "2" }),
      makeFefRow({ taskCode: "WLD-CS", quantity: "8" }),
    ];
    const next = applyFillDown(data, ["size"], range(0, 0, 1, 0), pipingCtx);
    expect(next[1].size).toBe("6");
    expect(next[1].boreSize).toBe("MB");
    expect(next[1].laborHours).toBe("6.0"); // 8 × 0.75
  });

  it("fills Task Code down, stamping the factor table's Unit", () => {
    const data = [makeFefRow({ taskCode: "WLD-CS", size: "4" }), makeFefRow({ size: "4", quantity: "4" })];
    const next = applyFillDown(data, ["taskCode"], range(0, 0, 1, 0), pipingCtx);
    expect(next[1].taskCode).toBe("WLD-CS");
    expect(next[1].unit).toBe("EA");
    expect(next[1].laborHours).toBe("2.0"); // 4 × 0.5
  });

  it("rejects a Task Code neither the piping nor the steel table knows", () => {
    expect(resolveCellWrite("taskCode", "NOPE", makeFefRow(), pipingCtx)).toBeNull();
  });

  it("stamps the steel member's UoM when the sheet is structural steel", () => {
    const steelCtx: WriteCtx = { ...ctx, steelMemberUomLookup: { W12X26: "LF" } };
    expect(resolveCellWrite("taskCode", "W12X26", makeFefRow(), steelCtx)).toEqual({
      taskCode: "W12X26",
      unit: "LF",
    });
  });

  it("stamps the CBS item once metallurgy and bore both resolve", () => {
    const row = makeFefRow({ weldGroupDescription: "CS 150#", boreSize: "MB" });
    expect(resolveCellWrite("shopField", "Shop", row, pipingCtx)).toEqual({
      shopField: "Shop",
      metallurgyCode: "SHOPCS",
      id: "SHOPCS-MB-ST00-00-C",
      name: "Shop Fab CS Medium Bore Standard",
      unit: "LF",
    });
  });

  it("re-stamps a Shop row switched to Field with the install-series item", () => {
    // The install series is keyed differently from the shop series, so this
    // only resolves because the lookup tries every catalog shape.
    const row = makeFefRow({
      weldGroupDescription: "CS 150#",
      boreSize: "MB",
      id: "SHOPCS-MB-ST00-00-C",
      name: "Shop Fab CS Medium Bore Standard",
      unit: "LF",
    });
    expect(resolveCellWrite("shopField", "Field", row, pipingCtx)).toEqual({
      shopField: "Field",
      metallurgyCode: "FLDCS",
      id: "FLDCS-MB-0000-MB-C",
      name: "Install CS Medium Bore",
      unit: "LF",
    });
  });

  it("clears the CBS item when no catalog shape matches", () => {
    // Keeping the shop item would leave the row reading "Field" while still
    // carrying a "Shop Fab …" cost code — and that then saves.
    const row = makeFefRow({
      weldGroupDescription: "XS 150#",
      boreSize: "MB",
      id: "SHOPCS-MB-ST00-00-C",
      name: "Shop Fab CS Medium Bore Standard",
      unit: "LF",
    });
    expect(resolveCellWrite("shopField", "Field", row, pipingCtx)).toEqual({
      shopField: "Field",
      metallurgyCode: "NOCODE",
      id: "",
      name: "",
      unit: "",
    });
  });

  it("keeps a hand-picked item when the inputs can't compose a code yet", () => {
    // No bore size, so nothing was looked up — the Name the estimator chose
    // by hand must survive an unrelated edit.
    const row = makeFefRow({
      weldGroupDescription: "CS 150#",
      id: "601-10-0000-00-L",
      name: "3in Elbow",
      unit: "EA",
    });
    expect(resolveCellWrite("shopField", "Field", row, pipingCtx)).toEqual({
      shopField: "Field",
      metallurgyCode: "FLDCS",
    });
  });

  it("falls back to the task code's own Unit when the CBS lookup clears", () => {
    const row = makeFefRow({
      weldGroupDescription: "XS 150#",
      boreSize: "MB",
      metallurgyCode: "NOCODE",
      size: "4",
      quantity: "10",
    });
    const next = resolveCellWrite("taskCode", "WLD-CS", row, pipingCtx);
    // The stamp cleared (no Field code in the catalog), but Unit still carries
    // the factor table's value rather than being blanked with the rest.
    expect(next).toEqual({
      taskCode: "WLD-CS",
      laborHours: "5.0",
      id: "",
      name: "",
      unit: "EA",
    });
  });

  it("normalizes a Fabricate / Erect fill to the picker's own two options", () => {
    const row = makeFefRow();
    expect(resolveCellWrite("fabricateErect", "erect", row, pipingCtx)).toEqual({
      fabricateErect: "Erect",
    });
    expect(resolveCellWrite("fabricateErect", "  FABRICATE ", row, pipingCtx)).toEqual({
      fabricateErect: "Fabricate",
    });
    // Blank clears the cell; anything else is a value the dropdown could never
    // have produced, so the write is refused rather than stored as free text.
    expect(resolveCellWrite("fabricateErect", "", row, pipingCtx)).toEqual({
      fabricateErect: "",
    });
    expect(resolveCellWrite("fabricateErect", "Weld", row, pipingCtx)).toBeNull();
  });

  it("re-derives the metallurgy code when Shop/Field or Weld Group is filled", () => {
    const row = makeFefRow({ weldGroupDescription: "CS 150#" });
    expect(resolveCellWrite("shopField", "Shop", row, pipingCtx)).toEqual({
      shopField: "Shop",
      metallurgyCode: "SHOPCS",
    });
    expect(
      resolveCellWrite("weldGroupDescription", "cs 150#", makeFefRow({ shopField: "Field" }), pipingCtx),
    ).toEqual({
      weldGroupDescription: "CS 150#",
      metallurgyCode: "FLDCS",
    });
    // An unmapped classification is unresolvable rather than half-written.
    expect(
      resolveCellWrite("weldGroupDescription", "SS 300#", row, pipingCtx),
    ).toBeNull();
  });
});

describe("indexed option lookups", () => {
  // The resolvers moved from Array.find to prebuilt Maps. Array.find returns
  // the EARLIEST match, so duplicate keys must still resolve to the first
  // option in the list, not the last one inserted.
  it("resolves a duplicated code or name to the first matching option", () => {
    const dupCtx: WriteCtx = {
      ...ctx,
      cbsOptions: [
        {
          displayCode: "700-10-0000-00-L",
          costCode: "70010DUP",
          name: "Conduit",
          uom: "LF",
          displayDescription: null,
        },
        {
          // Same display code, cost code and name as the entry above.
          displayCode: "700-10-0000-00-L",
          costCode: "70010DUP",
          name: "Conduit",
          uom: "EA",
          displayDescription: null,
        },
      ],
    };
    // Whichever key the lookup goes through, the first option (uom "LF") wins.
    for (const raw of ["700-10-0000-00-L", "70010dup", "conduit"]) {
      expect(resolveCellWrite("name", raw, makeFefRow(), dupCtx)).toEqual({
        id: "700-10-0000-00-L",
        name: "Conduit",
        unit: "LF",
      });
    }
  });

  it("keeps the area id-before-label precedence across options", () => {
    // Option A's label collides with option B's id. Array.find tested both
    // fields on each option in turn, so A wins.
    const collideCtx: WriteCtx = {
      ...ctx,
      areaOptions: [
        { value: "10", label: "20" },
        { value: "20", label: "Turbine" },
      ],
    };
    expect(resolveCellWrite("area", "20", makeFefRow(), collideCtx)).toEqual({
      area: "10",
    });
  });

  it("matches area, role and schedule case-insensitively, and rejects unknowns", () => {
    expect(resolveCellWrite("area", "  a-200 — TURBINE ", makeFefRow(), ctx)).toEqual({
      area: "2",
    });
    expect(resolveCellWrite("role", "welder", makeFefRow(), ctx)).toEqual({
      role: "Welder",
      laborRate: "",
    });
    expect(resolveCellWrite("role", "Plumber", makeFefRow(), ctx)).toBeNull();
    expect(resolveCellWrite("schedule", "ot", makeFefRow({ role: "Welder" }), ctx)).toEqual({
      schedule: "OT",
      laborRate: "90",
    });
    expect(resolveCellWrite("schedule", "Nights", makeFefRow(), ctx)).toBeNull();
  });

  it("builds one index per ctx, not one per row", () => {
    // Each ctx counts how often its option list is read. Building the index
    // reads it once; the per-cell resolvers must not read it at all.
    let scans = 0;
    const countingCtx = (): WriteCtx => ({
      ...ctx,
      get cbsOptions() {
        scans++;
        return ctx.cbsOptions;
      },
    });
    const data = [
      makeFefRow({ id: "601-10-0000-00-L" }),
      makeFefRow(),
      makeFefRow(),
      makeFefRow(),
    ];
    const sel = range(0, 0, 3, 0);

    const first = countingCtx();
    const next1 = applyFillDown(data, ["name"], sel, first);
    expect(next1[3].name).toBe("3in Elbow"); // the fill really resolved
    expect(scans).toBe(1); // one build for four rows

    applyFillDown(data, ["name"], sel, first); // same ctx — index reused
    serializeRange(data, ["name"], sel, first); // read path too
    expect(scans).toBe(1);

    applyFillDown(data, ["name"], sel, countingCtx()); // new ctx — rebuilt
    expect(scans).toBe(2);
  });
});

describe("sortRows", () => {
  const rows = [
    makeFefRow({ description: "Beta", quantity: "20" }),
    makeFefRow({ description: "alpha", quantity: "100" }),
    makeFefRow({ description: "Gamma", quantity: "3" }),
    makeFefRow({ id: "__fe-blank-9" }), // empty trailing blank
  ];

  it("sorts text ascending, case-insensitively-ish, blanks at bottom", () => {
    const out = sortRows(rows, "description", "asc", ctx);
    expect(out.map((r) => r.description)).toEqual(["alpha", "Beta", "Gamma", ""]);
    expect(out[3].id).toBe("__fe-blank-9"); // blank stays last
  });

  it("sorts numeric columns numerically, not lexically", () => {
    const out = sortRows(rows, "quantity", "asc", ctx);
    // 3, 20, 100 numerically (not "100" < "20" lexically), blank last
    expect(out.map((r) => r.quantity)).toEqual(["3", "20", "100", ""]);
  });

  it("descending reverses real rows but keeps blanks at the bottom", () => {
    const out = sortRows(rows, "quantity", "desc", ctx);
    expect(out.map((r) => r.quantity)).toEqual(["100", "20", "3", ""]);
    expect(out[3].id).toBe("__fe-blank-9");
  });
});

describe("find & replace", () => {
  // COLS: description=0, quantity=1, laborFactor=2, area=3, role=4, schedule=5, ...
  const rows = [
    makeFefRow({ description: "Pipe spool", notes: "spool note" }),
    makeFefRow({ description: "Elbow", notes: "" }),
    makeFefRow({ description: "PIPE flange", notes: "" }),
  ];

  it("finds cells containing the query, case-insensitively, row-major", () => {
    const hits = findMatches(rows, COLS, "pipe", ctx);
    // rows 0 and 2 description; "spool" is separate. Only description col (0).
    expect(hits).toEqual([
      { row: 0, col: 0 },
      { row: 2, col: 0 },
    ]);
  });

  it("returns no matches for an empty query", () => {
    expect(findMatches(rows, COLS, "", ctx)).toEqual([]);
  });

  it("replaces within a single writable cell (case-insensitive)", () => {
    const next = replaceInCell(rows, COLS, { row: 2, col: 0 }, "pipe", "Tube", ctx);
    expect(next[2].description).toBe("Tube flange");
    expect(next[0].description).toBe("Pipe spool"); // untouched
  });

  it("replace-all rewrites every writable cell and reports the count", () => {
    const { data: next, count } = replaceAll(rows, COLS, "spool", "assembly", ctx);
    expect(count).toBe(2); // description[0] and notes[0]
    expect(next[0].description).toBe("Pipe assembly");
    expect(next[0].notes).toBe("assembly note");
  });
});

describe("insertRows / deleteRows", () => {
  const rows = [
    makeFefRow({ id: "a" }),
    makeFefRow({ id: "b" }),
    makeFefRow({ id: "c" }),
  ];
  const blank = (i: number) => makeFefRow({ id: `__fe-blank-${i}` });

  it("inserts blank rows at an index, pushing the rest down", () => {
    const next = insertRows(rows, 1, 2, blank);
    expect(next.map((r) => r.id)).toEqual([
      "a",
      "__fe-blank-0",
      "__fe-blank-1",
      "b",
      "c",
    ]);
  });

  it("clamps the insert index and no-ops on non-positive count", () => {
    expect(insertRows(rows, 99, 1, blank).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "__fe-blank-0",
    ]);
    expect(insertRows(rows, 0, 0, blank)).toBe(rows);
  });

  it("deletes an inclusive row range", () => {
    expect(deleteRows(rows, 1, 2).map((r) => r.id)).toEqual(["a"]);
    expect(deleteRows(rows, 0, 0).map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("selectionStats", () => {
  const rows = [
    makeFefRow({ quantity: "10", description: "a" }),
    makeFefRow({ quantity: "20", description: "" }),
    makeFefRow({ quantity: "", description: "note" }),
    makeFefRow({ quantity: "1,200", description: "x" }),
  ];

  it("sums, averages, and counts the numeric cells in the selection", () => {
    // quantity column (COLS index 1), rows 0..3: 10, 20, "" (skip), 1,200
    const s = selectionStats(rows, COLS, range(0, 1, 3, 1), ctx);
    expect(s.count).toBe(3); // non-empty
    expect(s.numericCount).toBe(3);
    expect(s.sum).toBe(1230);
    expect(s.average).toBe(410);
  });

  it("counts non-empty text cells but keeps sum/average at 0 when non-numeric", () => {
    // description column (COLS index 0), rows 0..3: "a", "", "note", "x"
    const s = selectionStats(rows, COLS, range(0, 0, 3, 0), ctx);
    expect(s.count).toBe(3);
    expect(s.numericCount).toBe(0);
    expect(s.sum).toBe(0);
    expect(s.average).toBe(0);
  });
});

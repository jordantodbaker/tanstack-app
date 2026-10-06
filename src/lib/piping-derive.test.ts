import { describe, expect, it } from "vitest";
import {
  fabricateErectCode,
  fabricationHint,
  pipingCostCodes,
  pipingSizeCode,
  resolveCbsStamp,
} from "./piping-derive";

/**
 * Modelled on the real Master CBS, which keys the metallurgy families
 * differently in the same two segments:
 *   610 (shop fab)  → "…0000-LB-L"  bore repeated in the last segment
 *   640 (install)   → "…0000-00-L"  plain bore rollup
 *   645 (copper)    → only schedule-qualified rows below the bore
 *
 * 641 stands for a metallurgy whose bore-level codes this project has not
 * enabled: only its summary row is in reach, and the ladder must NOT settle
 * for that.
 *
 * Every row below the metallurgy summary is cost type `L`; the summary itself
 * is `0`, which is why the ladder stops at the bore.
 */
const CATALOG = new Map([
  [
    "610MB0000MBL",
    {
      displayCode: "610-MB-0000-MB-L",
      name: "Shop Fab Carbon Steel Medium Bore",
      uom: "LF",
    },
  ],
  [
    "640MB000000L",
    {
      displayCode: "640-MB-0000-00-L",
      name: "Install Carbon Steel Medium Bore",
      uom: "LF",
    },
  ],
  [
    "645MB000000L",
    {
      displayCode: "645-MB-0000-00-L",
      name: "Install Copper Medium Bore",
      uom: "LF",
    },
  ],
  [
    "641000000000",
    {
      displayCode: "641-00-0000-00-0",
      name: "Install Stainless Steel",
      uom: "LF",
    },
  ],
  [
    "610000000000",
    {
      displayCode: "610-00-0000-00-0",
      name: "Shop Fab Carbon Steel",
      uom: "LF",
    },
  ],
]);
const find = (code: string) => CATALOG.get(code);

describe("pipingCostCodes", () => {
  it("offers the two bore-level shapes and stops there", () => {
    expect(pipingCostCodes("610", "MB")).toEqual([
      "610MB0000MBL",
      "610MB000000L",
    ]);
  });

  it("returns nothing when either half is missing", () => {
    expect(pipingCostCodes("", "MB")).toEqual([]);
    expect(pipingCostCodes("610", "")).toEqual([]);
  });

  it("composes codes of the catalog's own 12-character width", () => {
    for (const code of pipingCostCodes("640", "LB", {
      sizeCode: "12",
      feCode: "ER",
    })) {
      expect(code).toHaveLength(12);
    }
  });
});

describe("resolveCbsStamp", () => {
  it("resolves a Shop row to the bore rollup that repeats the bore", () => {
    expect(resolveCbsStamp("610", "MB", find)).toEqual({
      id: "610-MB-0000-MB-L",
      name: "Shop Fab Carbon Steel Medium Bore",
      unit: "LF",
    });
  });

  it("resolves a Field row to the plain install bore rollup", () => {
    // The install series leaves the last segment blank where shop repeats the
    // bore. Trying only one shape is why Field rows resolved to nothing.
    expect(resolveCbsStamp("640", "MB", find)).toEqual({
      id: "640-MB-0000-00-L",
      name: "Install Carbon Steel Medium Bore",
      unit: "LF",
    });
  });

  it("resolves the copper/brass/aluminium series to its plain bore rollup", () => {
    expect(resolveCbsStamp("645", "MB", find)).toEqual({
      id: "645-MB-0000-00-L",
      name: "Install Copper Medium Bore",
      unit: "LF",
    });
  });

  it("leaves the row alone when the inputs can't compose a code", () => {
    // Nothing was looked up, so nothing is known — and the row's current item
    // may be a Name the estimator picked by hand.
    expect(resolveCbsStamp("", "MB", find)).toBeUndefined();
    expect(resolveCbsStamp("610", "", find)).toBeUndefined();
  });

  it("clears rather than settling for the metallurgy summary row", () => {
    // 641's summary (641-00-0000-00-0) is in the catalog, but it is a cost type
    // "0" rollup, not a cost account. Stamping it would put hours against a
    // summary — and because every L1 has one, a stale metallurgy code would
    // resolve to an unrelated account instead of failing visibly.
    expect(resolveCbsStamp("641", "MB", find)).toEqual({
      id: "",
      name: "",
      unit: "",
    });
  });

  it("never resolves a non-piping account that shares a stale code", () => {
    // 603 is "Pipe Shop Support Services & Supplies" in the Master CBS, and
    // was Carbon Steel's shop code in the previous one. A row still carrying
    // the old code must resolve to nothing, not to the support account.
    const withSupport = (code: string) =>
      code === "603000000000"
        ? {
            displayCode: "603-00-0000-00-0",
            name: "Pipe Shop Support Services & Supplies",
            uom: "LS",
          }
        : undefined;
    expect(resolveCbsStamp("603", "MB", withSupport)).toEqual({
      id: "",
      name: "",
      unit: "",
    });
  });

  it("clears the row's item when no shape matches", () => {
    // Every shape was tried and the catalog has none of them — keeping the
    // previous item would leave the sheet asserting a contradicted cost code.
    expect(resolveCbsStamp("699", "MB", find)).toEqual({
      id: "",
      name: "",
      unit: "",
    });
  });
});

/**
 * Fabricate / Erect narrowing.
 *
 * The catalog fuses the choice onto a nominal size inside segment 3 —
 * `640-LB-12ER-00-L`, `640-LB-12FB-00-L`. There is deliberately NO bore-level
 * "…-00ER-…" rollup, so the narrowing only applies to a row that has resolved
 * a size code; otherwise the row falls back to the ladder it always used.
 *
 * The size code is bore-relative, which is the part most likely to be got
 * wrong: "10" is 1" under small bore and 10" under medium bore. Verified
 * against the catalog's own item names.
 */
describe("pipingSizeCode", () => {
  it("encodes small bore in tenths of an inch", () => {
    expect(pipingSizeCode("0.5", "SB")).toBe("05");
    expect(pipingSizeCode("0.75", "SB")).toBe("07");
    expect(pipingSizeCode("1", "SB")).toBe("10");
    expect(pipingSizeCode("1.5", "SB")).toBe("15");
    expect(pipingSizeCode("2", "SB")).toBe("20");
    expect(pipingSizeCode("2.5", "SB")).toBe("25");
  });

  it("encodes medium and large bore in whole inches", () => {
    expect(pipingSizeCode("3", "MB")).toBe("03");
    expect(pipingSizeCode("10", "MB")).toBe("10");
    expect(pipingSizeCode("12", "LB")).toBe("12");
    expect(pipingSizeCode("24", "LB")).toBe("24");
  });

  it("gives the same digits different meanings per bore class", () => {
    // 640-SB-1000-…-L is 1"; 640-MB-1000-…-L is 10". Only the bore segment
    // beside the code tells them apart.
    expect(pipingSizeCode("1", "SB")).toBe("10");
    expect(pipingSizeCode("10", "MB")).toBe("10");
  });

  it("has no code for a medium/large size between catalog steps", () => {
    // 12.5" LB isn't in the catalog. Truncating to "12" would resolve the row
    // to an item that says 12", so it falls through to the bore rollup.
    expect(pipingSizeCode("12.5", "LB")).toBeUndefined();
    expect(pipingSizeCode("3.5", "MB")).toBeUndefined();
  });

  it("truncates an off-step small-bore size to a code that simply won't match", () => {
    // Small bore truncates by design (.75" → "07"), so 1.11" yields "11".
    // There is no SB-1100 item, so the ladder falls through — the same outcome
    // as no code, reached one step later.
    expect(pipingSizeCode("1.11", "SB")).toBe("11");
  });

  it("returns undefined for blank, non-numeric or non-positive sizes", () => {
    expect(pipingSizeCode("", "LB")).toBeUndefined();
    expect(pipingSizeCode("abc", "LB")).toBeUndefined();
    expect(pipingSizeCode("0", "SB")).toBeUndefined();
    expect(pipingSizeCode("-4", "MB")).toBeUndefined();
  });

  it("tolerates float noise in the tenths conversion", () => {
    // 0.3 * 10 is 2.9999999999999996 in binary floating point.
    expect(pipingSizeCode("0.3", "SB")).toBe("03");
  });
});

describe("fabricateErectCode", () => {
  it("maps the picker's two values to catalog abbreviations", () => {
    expect(fabricateErectCode("Fabricate")).toBe("FB");
    expect(fabricateErectCode("Erect")).toBe("ER");
  });

  it("has no code for an unset or unknown value", () => {
    expect(fabricateErectCode("")).toBeUndefined();
    expect(fabricateErectCode("fabricate")).toBeUndefined();
    expect(fabricateErectCode("Install")).toBeUndefined();
  });
});

describe("fabricationHint", () => {
  const row = { size: "12", boreSize: "LB", fabricateErect: "Erect" };

  it("pairs the size code with the work type", () => {
    expect(fabricationHint(row)).toEqual({ sizeCode: "12", feCode: "ER" });
  });

  it("keeps the size code when the row has no work type yet", () => {
    // The size alone narrows to the nominal-size rollup, which is a real
    // catalog row ("Shop Fab Carbon Steel Large Bore 12\"").
    expect(fabricationHint({ ...row, fabricateErect: "" })).toEqual({
      sizeCode: "12",
      feCode: undefined,
    });
  });

  it("is undefined without a usable size", () => {
    // A work type alone can't narrow anything — the catalog has no bore-level
    // ER/FB rollup to fall back to.
    expect(fabricationHint({ ...row, size: "" })).toBeUndefined();
    expect(fabricationHint({ ...row, size: "12.5" })).toBeUndefined();
  });
});

describe("pipingCostCodes with size and Fabricate / Erect", () => {
  const ROLLUPS = ["640LB0000LBL", "640LB000000L"];

  it("puts the work-type codes ahead of every rollup", () => {
    const codes = pipingCostCodes("640", "LB", { sizeCode: "12", feCode: "ER" });
    expect(codes.slice(0, 2)).toEqual(["640LB12ER00L", "640LB12ERSTL"]);
  });

  it("builds the Fabricate variant from the same inputs", () => {
    expect(
      pipingCostCodes("640", "LB", { sizeCode: "12", feCode: "FB" })[0],
    ).toBe("640LB12FB00L");
  });

  it("narrows to the nominal-size rollups with a size but no work type", () => {
    expect(pipingCostCodes("640", "LB", { sizeCode: "12" })).toEqual([
      "640LB1200STL",
      "640LB120000L",
      ...ROLLUPS,
    ]);
  });

  it("leaves the ladder at the bore level with no hint at all", () => {
    expect(pipingCostCodes("640", "LB")).toEqual(ROLLUPS);
  });

  it("keeps the rollups below the narrower codes as a fallback", () => {
    // A project whose enabled scope stops at the bore level still resolves,
    // just less specifically.
    const codes = pipingCostCodes("640", "LB", { sizeCode: "12", feCode: "ER" });
    expect(codes.slice(2)).toEqual([
      "640LB1200STL",
      "640LB120000L",
      ...ROLLUPS,
    ]);
  });
});

describe("resolveCbsStamp with size and Fabricate / Erect", () => {
  /** Stands in for a project's enabled catalog. */
  const catalog = (codes: Record<string, string>) => (code: string) =>
    codes[code]
      ? { displayCode: code, name: codes[code], uom: "LF" }
      : undefined;

  const CATALOG = catalog({
    "640LB12ER00L": "Install Carbon Steel Large Bore 12\" - Erect",
    "640LB12FB00L": "Install Carbon Steel Large Bore 12\" - Field Fabricate",
    "640LB1200STL": "Install Carbon Steel Large Bore 12\"",
    "640LB000000L": "Install Carbon Steel Large Bore",
  });

  it("selects the Erect item when the row says Erect", () => {
    expect(
      resolveCbsStamp("640", "LB", CATALOG, { sizeCode: "12", feCode: "ER" }),
    ).toMatchObject({ name: 'Install Carbon Steel Large Bore 12" - Erect' });
  });

  it("selects the Fabricate item when the row says Fabricate", () => {
    expect(
      resolveCbsStamp("640", "LB", CATALOG, { sizeCode: "12", feCode: "FB" }),
    ).toMatchObject({
      name: 'Install Carbon Steel Large Bore 12" - Field Fabricate',
    });
  });

  it("selects the nominal-size item when the row has a size but no work type", () => {
    expect(
      resolveCbsStamp("640", "LB", CATALOG, { sizeCode: "12" }),
    ).toMatchObject({ name: 'Install Carbon Steel Large Bore 12"' });
  });

  it("falls back to the bore rollup when the row has no size", () => {
    expect(resolveCbsStamp("640", "LB", CATALOG)).toMatchObject({
      name: "Install Carbon Steel Large Bore",
    });
  });

  it("falls back when the project hasn't enabled the fabrication code", () => {
    const narrow = catalog({ "640LB000000L": "Install Carbon Steel Large Bore" });
    expect(
      resolveCbsStamp("640", "LB", narrow, { sizeCode: "12", feCode: "ER" }),
    ).toMatchObject({ name: "Install Carbon Steel Large Bore" });
  });

  it("uses the schedule-qualified row for a series that has no plain work-type code", () => {
    // Copper, brass, aluminium and the high alloys only carry "…{FE}{ST|XH|XX}".
    const copper = catalog({
      "645LB12FBSTL": 'Field Fab Copper LB: 12" Sch Standard or less',
    });
    expect(
      resolveCbsStamp("645", "LB", copper, { sizeCode: "12", feCode: "FB" }),
    ).toMatchObject({
      name: 'Field Fab Copper LB: 12" Sch Standard or less',
    });
  });

  it("still clears the item when nothing in the ladder matches", () => {
    expect(
      resolveCbsStamp("640", "LB", catalog({}), { sizeCode: "12", feCode: "ER" }),
    ).toEqual({ id: "", name: "", unit: "" });
  });
});

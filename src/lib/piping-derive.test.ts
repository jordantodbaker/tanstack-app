import { describe, expect, it } from "vitest";
import {
  fabricateErectCode,
  fabricationHint,
  pipingCostCodes,
  pipingSizeCode,
  resolveCbsStamp,
} from "./piping-derive";

/**
 * Modelled on the real catalog, which keys the three metallurgy families
 * differently in the same two segments:
 *   603 (shop)      → "…ST00-00-C"   the Standard bore rollup
 *   633 (install)   → "…0000-MB-C"   bore repeated in the last segment
 *   638 (install)   → "…0000-00-C"   plain bore rollup
 *
 * 634 stands for a metallurgy the *project* has only enabled at the rollup
 * level — the catalog has bore-level codes for it, but this project's CBS
 * scope doesn't include them, so only the parent is reachable.
 */
const CATALOG = new Map([
  [
    "603MBST0000C",
    {
      displayCode: "603-MB-ST00-00-C",
      name: "Shop Fab Carbon Steel Medium Bore Standard",
      uom: "LF",
    },
  ],
  [
    "633MB0000MBC",
    {
      displayCode: "633-MB-0000-MB-C",
      name: "Install Carbon Steel Medium Bore",
      uom: "LF",
    },
  ],
  [
    "638MB000000C",
    {
      displayCode: "638-MB-0000-00-C",
      name: "Install Copper Medium Bore",
      uom: "LF",
    },
  ],
  [
    "63400000000C",
    {
      displayCode: "634-00-0000-00-C",
      name: "Install Stainless Steel",
      uom: "LF",
    },
  ],
  [
    "60300000000C",
    {
      displayCode: "603-00-0000-00-C",
      name: "Shop Fab Carbon Steel",
      uom: "LF",
    },
  ],
]);
const find = (code: string) => CATALOG.get(code);

describe("pipingCostCodes", () => {
  it("offers the bore-level shapes first, then the metallurgy parent", () => {
    expect(pipingCostCodes("603", "MB")).toEqual([
      "603MBST0000C",
      "603MB0000MBC",
      "603MB000000C",
      "60300000000C",
    ]);
  });

  it("returns nothing when either half is missing", () => {
    expect(pipingCostCodes("", "MB")).toEqual([]);
    expect(pipingCostCodes("603", "")).toEqual([]);
  });
});

describe("resolveCbsStamp", () => {
  it("resolves a Shop row to the Standard bore rollup, as it always did", () => {
    expect(resolveCbsStamp("603", "MB", find)).toEqual({
      id: "603-MB-ST00-00-C",
      name: "Shop Fab Carbon Steel Medium Bore Standard",
      unit: "LF",
    });
  });

  it("resolves a Field row to the 633-series install rollup", () => {
    // The shape this series uses repeats the bore in the last segment. It has
    // no "ST00" code at all, which is why Field rows resolved to nothing until
    // the lookup tried more than one shape.
    expect(resolveCbsStamp("633", "MB", find)).toEqual({
      id: "633-MB-0000-MB-C",
      name: "Install Carbon Steel Medium Bore",
      unit: "LF",
    });
  });

  it("resolves a Field row to the plain bore rollup for 638–643", () => {
    expect(resolveCbsStamp("638", "MB", find)).toEqual({
      id: "638-MB-0000-00-C",
      name: "Install Copper Medium Bore",
      unit: "LF",
    });
  });

  it("leaves the row alone when the inputs can't compose a code", () => {
    // Nothing was looked up, so nothing is known — and the row's current item
    // may be a Name the estimator picked by hand.
    expect(resolveCbsStamp("", "MB", find)).toBeUndefined();
    expect(resolveCbsStamp("603", "", find)).toBeUndefined();
  });

  it("falls back to the metallurgy parent when no bore-level code is reachable", () => {
    // The row still selected a real thing — Stainless, Field, medium bore — so
    // a broader-but-correct item beats leaving the row blank.
    expect(resolveCbsStamp("634", "MB", find)).toEqual({
      id: "634-00-0000-00-C",
      name: "Install Stainless Steel",
      unit: "LF",
    });
  });

  it("prefers the bore-level code over the parent when both are reachable", () => {
    // 603 has both "603-MB-ST00-00-C" and its parent "603-00-0000-00-C" in
    // reach; the more specific one has to win, or every row would collapse to
    // the metallurgy rollup.
    expect(resolveCbsStamp("603", "MB", find)).toEqual({
      id: "603-MB-ST00-00-C",
      name: "Shop Fab Carbon Steel Medium Bore Standard",
      unit: "LF",
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
 * `633-LB-12ER-00-C`, `633-LB-12FB-00-C`. There is deliberately NO bore-level
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
    // 633-SB-1000-ST-C is 1"; 633-MB-1000-ST-C is 10". Only the bore segment
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

  it("is undefined without a work type", () => {
    expect(fabricationHint({ ...row, fabricateErect: "" })).toBeUndefined();
  });

  it("is undefined without a usable size", () => {
    // A work type alone can't narrow anything — the catalog has no bore-level
    // ER/FB rollup to fall back to.
    expect(fabricationHint({ ...row, size: "" })).toBeUndefined();
    expect(fabricationHint({ ...row, size: "12.5" })).toBeUndefined();
  });
});

describe("pipingCostCodes with Fabricate / Erect", () => {
  it("puts the fabrication code ahead of every rollup", () => {
    const codes = pipingCostCodes("633", "LB", { sizeCode: "12", feCode: "ER" });
    expect(codes[0]).toBe("633LB12ER00C");
    // 633-LB-12ER-00-C, normalized.
    expect(codes).toHaveLength(5);
  });

  it("builds the Fabricate variant from the same inputs", () => {
    expect(
      pipingCostCodes("633", "LB", { sizeCode: "12", feCode: "FB" })[0],
    ).toBe("633LB12FB00C");
  });

  it("leaves the ladder untouched when there is no fabrication hint", () => {
    expect(pipingCostCodes("633", "LB")).toEqual([
      "633LBST0000C",
      "633LB0000LBC",
      "633LB000000C",
      "63300000000C",
    ]);
  });

  it("keeps the rollups below the fabrication code as a fallback", () => {
    // A project whose enabled scope stops at the bore level still resolves,
    // just less specifically.
    const codes = pipingCostCodes("633", "LB", { sizeCode: "12", feCode: "ER" });
    expect(codes.slice(1)).toEqual([
      "633LBST0000C",
      "633LB0000LBC",
      "633LB000000C",
      "63300000000C",
    ]);
  });
});

describe("resolveCbsStamp with Fabricate / Erect", () => {
  /** Stands in for a project's enabled catalog. */
  const catalog = (codes: Record<string, string>) => (code: string) =>
    codes[code]
      ? { displayCode: code, name: codes[code], uom: "LF" }
      : undefined;

  const CATALOG = catalog({
    "633LB12ER00C": "Install Carbon Steel Large Bore - Erect",
    "633LB12FB00C": "Install Carbon Steel Large Bore - Field Fabricate",
    "633LB0000LBC": "Install Carbon Steel Large Bore",
    "63300000000C": "Install Carbon Steel",
  });

  it("selects the Erect item when the row says Erect", () => {
    expect(
      resolveCbsStamp("633", "LB", CATALOG, { sizeCode: "12", feCode: "ER" }),
    ).toMatchObject({ name: "Install Carbon Steel Large Bore - Erect" });
  });

  it("selects the Fabricate item when the row says Fabricate", () => {
    expect(
      resolveCbsStamp("633", "LB", CATALOG, { sizeCode: "12", feCode: "FB" }),
    ).toMatchObject({
      name: "Install Carbon Steel Large Bore - Field Fabricate",
    });
  });

  it("falls back to the bore rollup when the row has no work type", () => {
    expect(resolveCbsStamp("633", "LB", CATALOG)).toMatchObject({
      name: "Install Carbon Steel Large Bore",
    });
  });

  it("falls back when the project hasn't enabled the fabrication code", () => {
    const narrow = catalog({ "633LB0000LBC": "Install Carbon Steel Large Bore" });
    expect(
      resolveCbsStamp("633", "LB", narrow, { sizeCode: "12", feCode: "ER" }),
    ).toMatchObject({ name: "Install Carbon Steel Large Bore" });
  });

  it("still clears the item when nothing in the ladder matches", () => {
    expect(
      resolveCbsStamp("633", "LB", catalog({}), { sizeCode: "12", feCode: "ER" }),
    ).toEqual({ id: "", name: "", unit: "" });
  });
});

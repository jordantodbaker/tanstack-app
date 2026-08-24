import { describe, expect, it } from "vitest";
import { pipingCostCodes, resolveCbsStamp } from "./piping-derive";

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

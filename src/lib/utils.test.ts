import { describe, expect, it } from "vitest";
import { computeBoreSize } from "./utils";

/**
 * The bore bands are load-bearing in two places: they pick the bore segment of
 * a piping CBS cost code (`640-MB-…`), and they are what the Pipe Category
 * column shows. Both read this one table, so the boundaries are pinned here.
 *
 * The bands have to match the catalog's own size steps, or a row bands into a
 * bore series that has no item for its size: SB .5–2.5", MB 3–10", LB 12–24",
 * XB 30"+.
 */
describe("computeBoreSize", () => {
  it("bands a size into SB / MB / LB / XB", () => {
    expect(computeBoreSize("2")).toBe("SB");
    expect(computeBoreSize("6")).toBe("MB");
    expect(computeBoreSize("18")).toBe("LB");
    expect(computeBoreSize("30")).toBe("XB");
  });

  it("puts each boundary where the catalog's size steps change series", () => {
    // Under 3 small; 3 up to (not including) 12 medium — the catalog's medium
    // bore stops at 10"; 12 up to 24 large; above 24 extra large.
    expect(computeBoreSize("2.9")).toBe("SB");
    expect(computeBoreSize("3")).toBe("MB");
    expect(computeBoreSize("10")).toBe("MB");
    expect(computeBoreSize("12")).toBe("LB");
    expect(computeBoreSize("24")).toBe("LB");
    expect(computeBoreSize("24.1")).toBe("XB");
  });

  it("handles fractional and decorated sizes the way parseFloat does", () => {
    expect(computeBoreSize("1.5")).toBe("SB");
    expect(computeBoreSize('8"')).toBe("MB");
  });

  it("returns empty for a blank or unparseable size", () => {
    expect(computeBoreSize("")).toBe("");
    expect(computeBoreSize("   ")).toBe("");
    expect(computeBoreSize("N/A")).toBe("");
  });
});

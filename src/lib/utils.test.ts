import { describe, expect, it } from "vitest";
import { computeBoreSize } from "./utils";

/**
 * The bore bands are load-bearing in two places: they pick the bore segment of
 * a piping CBS cost code (`603-MB-…`), and they are what the Pipe Category
 * column shows. Both read this one table, so the boundaries are pinned here.
 */
describe("computeBoreSize", () => {
  it("bands a size into SB / MB / LB / XB", () => {
    expect(computeBoreSize("2")).toBe("SB");
    expect(computeBoreSize("6")).toBe("MB");
    expect(computeBoreSize("18")).toBe("LB");
    expect(computeBoreSize("30")).toBe("XB");
  });

  it("puts each boundary in the lower band", () => {
    // Under 3 small; 3–12 medium; over 12 up to 24 large; above 24 extra large.
    expect(computeBoreSize("2.9")).toBe("SB");
    expect(computeBoreSize("3")).toBe("MB");
    expect(computeBoreSize("12")).toBe("MB");
    expect(computeBoreSize("12.1")).toBe("LB");
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

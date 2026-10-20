import { describe, expect, it } from "vitest";
import { disciplineById } from "./disciplines";
import { isMaterialL1, isSupportL1 } from "./disciplines-data";

/**
 * The sheet split every take-off page makes by L1 alone: materials (XY1) go to
 * the Materials page, field staff / support (XY2) seed Support Labor, and
 * everything else is a take-off code. `disciplines-cbs.test.ts` checks the rule
 * against the real workbook; this pins the rule itself.
 */
describe("isMaterialL1 / isSupportL1", () => {
  it("reads the shop and field materials blocks", () => {
    for (const l1 of ["601", "631", "131", "731", "931"]) {
      expect(isMaterialL1(l1), l1).toBe(true);
    }
  });

  it("reads the shop and field staff blocks", () => {
    for (const l1 of ["602", "632", "132", "732", "932"]) {
      expect(isSupportL1(l1), l1).toBe(true);
    }
  });

  it("leaves summary, labor and other overhead blocks on the take-off", () => {
    for (const l1 of ["600", "610", "640", "240", "303", "534", "842"]) {
      expect(isMaterialL1(l1), l1).toBe(false);
      expect(isSupportL1(l1), l1).toBe(false);
    }
  });

  it("does not read the project root block by suffix", () => {
    // 001 is Project Development, not a materials account. Reading it by
    // suffix put Project Development's only code on the Materials page and
    // left its own take-off with nothing to pick.
    expect(isMaterialL1("001")).toBe(false);
    expect(isSupportL1("002")).toBe(false);
    expect(isMaterialL1("000")).toBe(false);
  });

  it("leaves Project Development a take-off code to pick", () => {
    const codes = disciplineById["project-development"].l1Codes ?? [];
    expect(codes.filter((c) => !isMaterialL1(c) && !isSupportL1(c))).toEqual(
      codes,
    );
  });
});

import { describe, expect, it } from "vitest";
import { computeVisibleCount } from "./TopNav";

// Five links of 100px, a 4px gap, an 80px "More" trigger.
const W = [100, 100, 100, 100, 100];
const MORE = 80;

describe("computeVisibleCount", () => {
  it("shows every link when the whole row (gaps included) fits", () => {
    // 5 × 100 + 4 gaps × 4 = 516
    expect(computeVisibleCount(W, MORE, 516)).toBe(5);
  });

  it("collapses when the gaps alone push the row over the width", () => {
    // 500px of links fits, but not once the 16px of gaps are counted.
    expect(computeVisibleCount(W, MORE, 510)).toBeLessThan(5);
  });

  it("reserves room for the More trigger before fitting links", () => {
    // 3 links = 308, + gap + More = 392 fits in 400; a 4th (496) does not.
    expect(computeVisibleCount(W, MORE, 400)).toBe(3);
    expect(computeVisibleCount(W, MORE, 391)).toBe(2);
  });

  it("collapses everything into More when nothing fits beside it", () => {
    expect(computeVisibleCount(W, MORE, 150)).toBe(0);
  });

  it("handles an empty link set", () => {
    expect(computeVisibleCount([], MORE, 300)).toBe(0);
  });
});

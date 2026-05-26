import { describe, expect, it } from "vitest";
import {
  cvTone,
  formatCompact,
  formatCurrency,
  formatMoney,
  formatRatio,
  formatSignedCurrency,
  indexTone,
} from "./formatting";

describe("formatMoney", () => {
  it("formats with two-decimal precision and US comma grouping", () => {
    expect(formatMoney(1234.5)).toBe("1,234.50");
    expect(formatMoney(1_000_000)).toBe("1,000,000.00");
  });

  it("handles zero as 0.00 (formatCurrency layers the '$0' shortcut on top)", () => {
    expect(formatMoney(0)).toBe("0.00");
  });

  it("preserves negative sign in the toLocaleString position (before the digits)", () => {
    expect(formatMoney(-100)).toBe("-100.00");
  });
});

describe("formatCompact", () => {
  it("shortens millions to M with two decimals", () => {
    expect(formatCompact(1_500_000)).toBe("$1.50M");
    expect(formatCompact(12_345_678)).toBe("$12.35M");
  });

  it("shortens thousands to K with one decimal", () => {
    expect(formatCompact(1_500)).toBe("$1.5K");
    expect(formatCompact(999)).toBe("$999.00");
  });

  it("returns '$0' for zero", () => {
    expect(formatCompact(0)).toBe("$0");
  });
});

describe("formatCurrency", () => {
  it("returns '$0' for zero", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("returns '$0' for non-finite inputs (NaN, Infinity)", () => {
    // Treats NaN / Infinity as no-data rather than rendering "NaN" or "$∞".
    expect(formatCurrency(Number.NaN)).toBe("$0");
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe("$0");
    expect(formatCurrency(Number.NEGATIVE_INFINITY)).toBe("$0");
  });

  it("formats positive values with the $ prefix", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
    expect(formatCurrency(1_000_000)).toBe("$1,000,000.00");
  });

  it("puts the negative sign IN FRONT of the $ rather than between $ and digits", () => {
    // Documents the silent-bug fix from the formatter consolidation: the old
    // reporting.tsx `money()` produced "$-100.00" which was wrong.
    expect(formatCurrency(-100)).toBe("-$100.00");
    expect(formatCurrency(-1_234.56)).toBe("-$1,234.56");
  });
});

describe("formatSignedCurrency", () => {
  it("returns '$0' for zero (no sign on a zero delta)", () => {
    expect(formatSignedCurrency(0)).toBe("$0");
  });

  it("returns '$0' for non-finite inputs", () => {
    expect(formatSignedCurrency(Number.NaN)).toBe("$0");
    expect(formatSignedCurrency(Number.POSITIVE_INFINITY)).toBe("$0");
  });

  it("prefixes positive values with '+'", () => {
    expect(formatSignedCurrency(100)).toBe("+$100.00");
    expect(formatSignedCurrency(1_234.56)).toBe("+$1,234.56");
  });

  it("prefixes negative values with '-' (in front of $, matching formatCurrency)", () => {
    expect(formatSignedCurrency(-100)).toBe("-$100.00");
    expect(formatSignedCurrency(-1_234.56)).toBe("-$1,234.56");
  });
});

describe("formatRatio", () => {
  it("renders finite numbers to two decimals", () => {
    expect(formatRatio(1)).toBe("1.00");
    expect(formatRatio(1.25)).toBe("1.25");
    expect(formatRatio(0.999)).toBe("1.00"); // rounding to two decimals
  });

  it("returns '—' for null (divide-by-zero signal from EVM)", () => {
    // EVM's `computeEvm` returns `cpi: null` when AC = 0 and `spi: null`
    // when PV = 0 — the dash is what the user actually sees in those cells.
    expect(formatRatio(null)).toBe("—");
  });

  it("returns '—' for NaN / Infinity", () => {
    expect(formatRatio(Number.NaN)).toBe("—");
    expect(formatRatio(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formats zero as '0.00' (a finite zero is a valid ratio)", () => {
    expect(formatRatio(0)).toBe("0.00");
  });

  it("formats negative ratios with a minus sign", () => {
    // Negative ratios are unusual but should still render predictably.
    expect(formatRatio(-0.5)).toBe("-0.50");
  });
});

describe("cvTone", () => {
  it("returns 'green' for positive (under budget / favorable)", () => {
    expect(cvTone(100)).toBe("green");
    expect(cvTone(0.01)).toBe("green");
  });

  it("returns 'red' for negative (over budget / unfavorable)", () => {
    expect(cvTone(-100)).toBe("red");
    expect(cvTone(-0.01)).toBe("red");
  });

  it("returns 'slate' for zero (no variance to flag)", () => {
    expect(cvTone(0)).toBe("slate");
  });

  it("returns 'slate' for NaN / Infinity (treat as no signal)", () => {
    expect(cvTone(Number.NaN)).toBe("slate");
    expect(cvTone(Number.POSITIVE_INFINITY)).toBe("slate");
    expect(cvTone(Number.NEGATIVE_INFINITY)).toBe("slate");
  });
});

describe("indexTone", () => {
  it("returns 'green' for index >= 1 (on or ahead of plan)", () => {
    expect(indexTone(1)).toBe("green");
    expect(indexTone(1.0001)).toBe("green");
    expect(indexTone(2.5)).toBe("green");
  });

  it("returns 'red' for index < 1 (behind plan)", () => {
    expect(indexTone(0.999)).toBe("red");
    expect(indexTone(0.5)).toBe("red");
    expect(indexTone(0)).toBe("red");
  });

  it("returns 'slate' for null (divide-by-zero, no signal)", () => {
    expect(indexTone(null)).toBe("slate");
  });

  it("returns 'slate' for NaN / Infinity", () => {
    expect(indexTone(Number.NaN)).toBe("slate");
    expect(indexTone(Number.POSITIVE_INFINITY)).toBe("slate");
  });
});

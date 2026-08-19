import { describe, expect, it } from "vitest";
import {
  cleanNumber,
  computeLaborHours,
  DEFAULT_LABOR_FACTOR,
  effectiveLaborFactor,
  normalizeCode,
} from "./fef-derive";

describe("computeLaborHours", () => {
  it("multiplies quantity by the factor, to 1dp", () => {
    expect(computeLaborHours("10", "3")).toBe("30.0");
    expect(computeLaborHours("2.5", "1.5")).toBe("3.8");
  });

  // The three former copies disagreed on this: the cell editors relied on
  // callers pre-resolving the default, the range/paste copies applied it
  // themselves. The merged helper always applies it.
  it("treats a blank factor as the default", () => {
    expect(computeLaborHours("10", "")).toBe("10.0");
    expect(computeLaborHours("10", DEFAULT_LABOR_FACTOR)).toBe("10.0");
  });

  it("returns '' when either input isn't numeric", () => {
    expect(computeLaborHours("", "3")).toBe("");
    expect(computeLaborHours("abc", "3")).toBe("");
    expect(computeLaborHours("10", "abc")).toBe("");
  });
});

describe("effectiveLaborFactor", () => {
  it("falls back to the default only for a blank stored factor", () => {
    expect(effectiveLaborFactor("")).toBe(DEFAULT_LABOR_FACTOR);
    expect(effectiveLaborFactor("2.5")).toBe("2.5");
    expect(effectiveLaborFactor("0")).toBe("0");
  });
});

describe("cleanNumber / normalizeCode", () => {
  it("strips currency, separators, and whitespace", () => {
    expect(cleanNumber("1,200")).toBe("1200");
    expect(cleanNumber("$45.00")).toBe("45.00");
    expect(cleanNumber(" 12 ")).toBe("12");
    expect(cleanNumber("")).toBe("");
  });

  it("matches CBS codes regardless of hyphens or case", () => {
    expect(normalizeCode("601-10-0000-00-L")).toBe("60110000000l");
    expect(normalizeCode("60110000000L")).toBe("60110000000l");
    expect(normalizeCode(" 601 10 ")).toBe("60110");
  });
});

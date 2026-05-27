import { describe, expect, it } from "vitest";
import { trendForecastContribution } from "./trends";

describe("trendForecastContribution", () => {
  it("multiplies probability by costLikely for active trends", () => {
    expect(
      trendForecastContribution({
        status: "IDENTIFIED",
        probability: 0.5,
        costLikely: 10_000,
      }),
    ).toBe(5_000);
    expect(
      trendForecastContribution({
        status: "PROBABLE",
        probability: 0.8,
        costLikely: 10_000,
      }),
    ).toBe(8_000);
  });

  it("returns 0 for terminal statuses — converted/rejected/void don't move AFC", () => {
    // CONVERTED trends have a linked CVR; their cost lives in budgetRevisions
    // already, so double-counting them in AFC would inflate the forecast.
    for (const status of ["CONVERTED", "REJECTED", "VOID"] as const) {
      expect(
        trendForecastContribution({
          status,
          probability: 1,
          costLikely: 99_999,
        }),
      ).toBe(0);
    }
  });

  it("clamps probability outside [0, 1] rather than punishing a typo", () => {
    expect(
      trendForecastContribution({
        status: "PROBABLE",
        probability: 1.5,
        costLikely: 1_000,
      }),
    ).toBe(1_000);
    expect(
      trendForecastContribution({
        status: "IDENTIFIED",
        probability: -0.2,
        costLikely: 1_000,
      }),
    ).toBe(0);
  });

  it("treats non-finite costLikely as zero", () => {
    expect(
      trendForecastContribution({
        status: "PROBABLE",
        probability: 1,
        costLikely: Number.NaN,
      }),
    ).toBe(0);
  });
});

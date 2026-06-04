import { describe, expect, it } from "vitest";
import { crewMixAverageWage } from "./crewMixes";

describe("crewMixAverageWage", () => {
  it("returns 0 for an empty member list", () => {
    expect(crewMixAverageWage([])).toBe(0);
  });

  it("returns the single wage when only one member", () => {
    expect(crewMixAverageWage([{ wage: 42 }])).toBe(42);
  });

  it("averages multiple wages", () => {
    expect(crewMixAverageWage([{ wage: 50 }, { wage: 70 }, { wage: 60 }])).toBe(
      60,
    );
  });

  it("handles fractional wages", () => {
    expect(
      crewMixAverageWage([{ wage: 32.5 }, { wage: 47.5 }]),
    ).toBe(40);
  });

  it("treats 0 wages as legitimate inputs (averaged in, not skipped)", () => {
    expect(crewMixAverageWage([{ wage: 0 }, { wage: 100 }])).toBe(50);
  });
});

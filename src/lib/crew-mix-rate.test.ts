import { describe, expect, it } from "vitest";
import { crewMixAverageRate, type RoleRateRow } from "./crew-mix-rate";

const rates: RoleRateRow[] = [
  { roleName: "Foreman", schedule: "1x5x10", rate: 60 },
  { roleName: "Foreman", schedule: "1x6x10", rate: 72 },
  { roleName: "Laborer", schedule: "1x5x10", rate: 40 },
  { roleName: "Welder", schedule: "1x6x10", rate: 80 },
];

describe("crewMixAverageRate", () => {
  it("averages member-role rates at the given schedule (count 1 each)", () => {
    expect(
      crewMixAverageRate(
        [
          { roleName: "Foreman", count: 1 },
          { roleName: "Laborer", count: 1 },
        ],
        "1x5x10",
        rates,
      ),
    ).toBe(50); // (60 + 40) / 2
  });

  it("weights by head count", () => {
    // 3 Laborers (40) + 1 Foreman (60) at 1x5x10 = (40*3 + 60) / 4 = 45
    expect(
      crewMixAverageRate(
        [
          { roleName: "Laborer", count: 3 },
          { roleName: "Foreman", count: 1 },
        ],
        "1x5x10",
        rates,
      ),
    ).toBe(45);
  });

  it("returns the single rate when only one role resolves", () => {
    expect(
      crewMixAverageRate([{ roleName: "Welder", count: 4 }], "1x6x10", rates),
    ).toBe(80);
  });

  it("excludes roles (and their counts) with no rate at that schedule", () => {
    // Laborer has no 1x6x10 rate → its 5 heads drop out; only Foreman counts.
    expect(
      crewMixAverageRate(
        [
          { roleName: "Foreman", count: 2 },
          { roleName: "Laborer", count: 5 },
        ],
        "1x6x10",
        rates,
      ),
    ).toBe(72);
  });

  it("ignores non-positive counts", () => {
    expect(
      crewMixAverageRate(
        [
          { roleName: "Foreman", count: 0 },
          { roleName: "Laborer", count: 2 },
        ],
        "1x5x10",
        rates,
      ),
    ).toBe(40); // Foreman dropped (count 0), only Laborer 40
  });

  it("returns 0 when nothing resolves, or schedule/list is empty", () => {
    expect(
      crewMixAverageRate([{ roleName: "Laborer", count: 1 }], "1x6x10", rates),
    ).toBe(0);
    expect(
      crewMixAverageRate([{ roleName: "Foreman", count: 1 }], "", rates),
    ).toBe(0);
    expect(crewMixAverageRate([], "1x5x10", rates)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  crewMixRateString,
  planRateRefresh,
  roleRateString,
  type CrewMixDef,
  type RefreshableRow,
} from "./rate-refresh";
import type { RoleRate } from "./role-rates";

/**
 * The safety properties matter more than the arithmetic here: a bulk write
 * over an estimate's line items must never blank a rate it can't resolve, must
 * be a no-op the second time, and must format exactly as the interactive path
 * does — otherwise the first refresh rewrites every row in the sheet.
 */

const rates: RoleRate[] = [
  { roleName: "Ironworker", schedule: "1x6x12", rate: 145 },
  { roleName: "Ironworker", schedule: "2x5x10", rate: 155 },
  { roleName: "Pipefitter", schedule: "1x6x12", rate: 120 },
];

const row = (over: Partial<RefreshableRow> = {}): RefreshableRow => ({
  id: 1,
  role: "Ironworker",
  schedule: "1x6x12",
  crewMixId: "",
  laborRate: "133",
  laborHours: "10",
  ...over,
});

describe("roleRateString", () => {
  it("formats exactly as the grid stamps it", () => {
    // `applyRoleRate` writes String(rate); anything else (145.00) would make
    // the first refresh rewrite every row in the sheet.
    expect(roleRateString(rates, "Ironworker", "1x6x12")).toBe("145");
  });

  it("is undefined for a pair the book doesn't carry", () => {
    expect(roleRateString(rates, "Ironworker", "3x8x8")).toBeUndefined();
    expect(roleRateString(rates, "Millwright", "1x6x12")).toBeUndefined();
  });

  it("is undefined when either half is blank", () => {
    expect(roleRateString(rates, "", "1x6x12")).toBeUndefined();
    expect(roleRateString(rates, "Ironworker", "")).toBeUndefined();
  });
});

describe("crewMixRateString", () => {
  const mix: CrewMixDef = {
    id: 7,
    name: "Pipe Gang",
    schedule: "1x6x12",
    members: [
      { roleName: "Ironworker", count: 1 },
      { roleName: "Pipefitter", count: 1 },
    ],
  };

  it("formats to two decimals, mirroring the grid", () => {
    // (145 + 120) / 2 = 132.5
    expect(crewMixRateString(mix, rates)).toBe("132.50");
  });

  it("is undefined when the mix prices at nothing", () => {
    expect(crewMixRateString({ ...mix, members: [] }, rates)).toBeUndefined();
    expect(
      crewMixRateString({ ...mix, schedule: "3x8x8" }, rates),
    ).toBeUndefined();
  });

  it("is undefined for a mix the row points at but that no longer exists", () => {
    expect(crewMixRateString(undefined, rates)).toBeUndefined();
  });
});

describe("planRateRefresh", () => {
  const plan = (rows: RefreshableRow[], crewMixes: CrewMixDef[] = []) =>
    planRateRefresh({ rows, rates, crewMixes });

  it("finds drifted rows and groups them by source and stored rate", () => {
    const out = plan([row({ id: 1 }), row({ id: 2 }), row({ id: 3 })]);
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0]).toMatchObject({
      label: "Ironworker @ 1x6x12",
      storedRate: "133",
      newRate: "145",
    });
    expect(out.changes[0].rowIds).toEqual([1, 2, 3]);
    expect(out.rowCount).toBe(3);
  });

  it("prices the impact as (new - stored) x hours", () => {
    // (145 - 133) x 10 hours x 3 rows
    const out = plan([row({ id: 1 }), row({ id: 2 }), row({ id: 3 })]);
    expect(out.totalDelta).toBeCloseTo(360, 5);
  });

  it("is a no-op when every row already matches", () => {
    const out = plan([row({ laborRate: "145" })]);
    expect(out.changes).toEqual([]);
    expect(out.rowCount).toBe(0);
  });

  it("treats 133 and 133.00 as the same rate", () => {
    // Numeric comparison, so a formatting difference isn't a change.
    const out = plan([row({ laborRate: "145.00" })]);
    expect(out.rowCount).toBe(0);
  });

  it("SKIPS rather than blanks a row whose pair no longer prices", () => {
    // The interactive path writes "" for an unknown pair. Doing that in bulk
    // would wipe the rate off every row whose schedule was since renamed.
    const out = plan([
      row({ id: 1, schedule: "3x8x8" }),
      row({ id: 2, role: "Millwright" }),
    ]);
    expect(out.changes).toEqual([]);
  });

  it("leaves rows with no rate source alone", () => {
    const out = plan([row({ id: 1, role: "", schedule: "", laborRate: "99" })]);
    expect(out.changes).toEqual([]);
  });

  it("recomputes crew-mix rows from the mix average", () => {
    const mix: CrewMixDef = {
      id: 7,
      name: "Pipe Gang",
      schedule: "1x6x12",
      members: [
        { roleName: "Ironworker", count: 1 },
        { roleName: "Pipefitter", count: 1 },
      ],
    };
    const out = plan(
      [row({ id: 1, role: "", schedule: "", crewMixId: "7", laborRate: "126.50" })],
      [mix],
    );
    expect(out.changes[0]).toMatchObject({
      label: "Crew: Pipe Gang",
      storedRate: "126.50",
      newRate: "132.50",
    });
  });

  it("prefers the crew mix when a row somehow carries both", () => {
    const mix: CrewMixDef = {
      id: 7,
      name: "Pipe Gang",
      schedule: "1x6x12",
      members: [{ roleName: "Pipefitter", count: 1 }],
    };
    // Picking a mix clears role/schedule, so this shouldn't occur — but if it
    // does, the mix is the row's declared rate source.
    const out = plan([row({ id: 1, crewMixId: "7", laborRate: "1" })], [mix]);
    expect(out.changes[0].label).toBe("Crew: Pipe Gang");
    expect(out.changes[0].newRate).toBe("120.00");
  });

  it("skips a crew-mix row whose mix was deleted", () => {
    const out = plan([row({ id: 1, crewMixId: "99", laborRate: "50" })], []);
    expect(out.changes).toEqual([]);
  });

  it("separates the same role at different stored rates", () => {
    const out = plan([
      row({ id: 1, laborRate: "133" }),
      row({ id: 2, laborRate: "120" }),
    ]);
    expect(out.changes).toHaveLength(2);
    expect(out.rowCount).toBe(2);
  });

  it("orders changes by absolute cost impact, largest first", () => {
    const out = plan([
      row({ id: 1, laborRate: "144", laborHours: "1" }), // +1
      row({ id: 2, role: "Pipefitter", laborRate: "20", laborHours: "10" }), // +1000
    ]);
    expect(out.changes[0].label).toBe("Pipefitter @ 1x6x12");
  });

  it("still updates a row with unparseable hours, pricing the delta at zero", () => {
    const out = plan([row({ laborHours: "" })]);
    expect(out.rowCount).toBe(1);
    expect(out.totalDelta).toBe(0);
  });

  it("counts a blank stored rate as a change from zero", () => {
    const out = plan([row({ laborRate: "", laborHours: "2" })]);
    expect(out.changes[0].newRate).toBe("145");
    expect(out.totalDelta).toBeCloseTo(290, 5);
  });

  it("reports a decrease as a negative impact", () => {
    const out = plan([row({ laborRate: "200", laborHours: "10" })]);
    expect(out.totalDelta).toBeCloseTo(-550, 5);
  });

  it("handles an empty sheet", () => {
    expect(planRateRefresh({ rows: [], rates, crewMixes: [] })).toEqual({
      changes: [],
      rowCount: 0,
      totalDelta: 0,
    });
  });
});

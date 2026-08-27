import { describe, expect, it } from "vitest";
import { crewMixAverageRate } from "./crew-mix-rate";
import {
  effectiveRate,
  resolveRoleIdRates,
  resolveRoleRates,
  toPlainRates,
  type RoleRate,
} from "./role-rates";

/**
 * The precedence chain is the whole feature: version beats project beats
 * global. These pin the rules that aren't obvious from that one sentence —
 * partial overrides falling through per-pair, scoped-only pairs surviving,
 * and the ordering the grid renders in staying stable.
 */

const rate = (roleName: string, schedule: string, r: number): RoleRate => ({
  roleName,
  schedule,
  rate: r,
});

const GLOBAL: RoleRate[] = [
  rate("Pipefitter", "ST", 68),
  rate("Pipefitter", "OT", 92),
  rate("Welder", "ST", 91),
  rate("Electrician", "ST", 77),
];

describe("resolveRoleRates", () => {
  it("falls back to global when nothing is overridden", () => {
    const out = resolveRoleRates({ global: GLOBAL });
    expect(out).toHaveLength(4);
    expect(out.every((r) => r.source === "global")).toBe(true);
    expect(effectiveRate(out, "Welder", "ST")?.rate).toBe(91);
  });

  it("lets a project rate beat the global one", () => {
    const out = resolveRoleRates({
      global: GLOBAL,
      project: [rate("Welder", "ST", 95)],
    });
    expect(effectiveRate(out, "Welder", "ST")).toMatchObject({
      rate: 95,
      source: "project",
    });
  });

  it("lets a version rate beat both", () => {
    const out = resolveRoleRates({
      global: GLOBAL,
      project: [rate("Welder", "ST", 95)],
      version: [rate("Welder", "ST", 99)],
    });
    expect(effectiveRate(out, "Welder", "ST")).toMatchObject({
      rate: 99,
      source: "version",
    });
  });

  it("overrides per (role, schedule) pair, not per role", () => {
    // Overriding Pipefitter at ST must NOT drag Pipefitter at OT along with it.
    const out = resolveRoleRates({
      global: GLOBAL,
      project: [rate("Pipefitter", "ST", 70)],
    });
    expect(effectiveRate(out, "Pipefitter", "ST")).toMatchObject({
      rate: 70,
      source: "project",
    });
    expect(effectiveRate(out, "Pipefitter", "OT")).toMatchObject({
      rate: 92,
      source: "global",
    });
  });

  it("leaves untouched roles on the global rate", () => {
    const out = resolveRoleRates({
      global: GLOBAL,
      project: [rate("Welder", "ST", 95)],
      version: [rate("Pipefitter", "ST", 72)],
    });
    expect(effectiveRate(out, "Electrician", "ST")).toMatchObject({
      rate: 77,
      source: "global",
    });
  });

  it("keeps a scoped pair the global book has never carried", () => {
    // A project can price a craft that isn't in the global book at all;
    // dropping it would make the override silently do nothing.
    const out = resolveRoleRates({
      global: GLOBAL,
      project: [rate("Millwright", "ST", 88)],
    });
    expect(effectiveRate(out, "Millwright", "ST")).toMatchObject({
      rate: 88,
      source: "project",
    });
    expect(out).toHaveLength(5);
  });

  it("emits each pair exactly once no matter how many books carry it", () => {
    const out = resolveRoleRates({
      global: [rate("Welder", "ST", 91)],
      project: [rate("Welder", "ST", 95)],
      version: [rate("Welder", "ST", 99)],
    });
    expect(out).toHaveLength(1);
  });

  it("preserves the global book's ordering", () => {
    // The admin controls role and schedule ordering; the resolved list is
    // rendered directly, so an override must not reshuffle the dropdown.
    const out = resolveRoleRates({
      global: GLOBAL,
      project: [rate("Electrician", "ST", 80)],
    });
    expect(out.map((r) => `${r.roleName}/${r.schedule}`)).toEqual([
      "Pipefitter/ST",
      "Pipefitter/OT",
      "Welder/ST",
      "Electrician/ST",
    ]);
  });

  it("appends scoped-only pairs after the global ones, project before version", () => {
    const out = resolveRoleRates({
      global: [rate("Welder", "ST", 91)],
      project: [rate("Millwright", "ST", 88)],
      version: [rate("Boilermaker", "ST", 84)],
    });
    expect(out.map((r) => r.roleName)).toEqual([
      "Welder",
      "Millwright",
      "Boilermaker",
    ]);
  });

  it("does not collide on names containing the separator", () => {
    // ("Lead", "Pipefitter ST") and ("Lead Pipefitter", "ST") must stay
    // distinct — a naive space-joined key would merge them.
    const out = resolveRoleRates({
      global: [
        rate("Lead", "Pipefitter ST", 10),
        rate("Lead Pipefitter", "ST", 20),
      ],
    });
    expect(out).toHaveLength(2);
    expect(effectiveRate(out, "Lead", "Pipefitter ST")?.rate).toBe(10);
    expect(effectiveRate(out, "Lead Pipefitter", "ST")?.rate).toBe(20);
  });

  it("treats a zero override as a real rate, not as absent", () => {
    const out = resolveRoleRates({
      global: [rate("Welder", "ST", 91)],
      project: [rate("Welder", "ST", 0)],
    });
    expect(effectiveRate(out, "Welder", "ST")).toMatchObject({
      rate: 0,
      source: "project",
    });
  });

  it("handles an empty global book", () => {
    expect(resolveRoleRates({ global: [] })).toEqual([]);
    expect(
      resolveRoleRates({ global: [], version: [rate("Welder", "ST", 99)] }),
    ).toHaveLength(1);
  });

  it("does not mutate its inputs", () => {
    const global = [rate("Welder", "ST", 91)];
    const project = [rate("Welder", "ST", 95)];
    resolveRoleRates({ global, project });
    expect(global[0].rate).toBe(91);
    expect(project[0].rate).toBe(95);
  });
});

describe("effectiveRate", () => {
  it("returns undefined for a pair no book carries", () => {
    const out = resolveRoleRates({ global: GLOBAL });
    expect(effectiveRate(out, "Welder", "DOUBLE_TIME")).toBeUndefined();
    expect(effectiveRate(out, "Nobody", "ST")).toBeUndefined();
  });
});

describe("toPlainRates", () => {
  it("strips the source tag to the shape the grid already consumes", () => {
    const out = toPlainRates(
      resolveRoleRates({
        global: GLOBAL,
        project: [rate("Welder", "ST", 95)],
      }),
    );
    expect(out).toContainEqual({ roleName: "Welder", schedule: "ST", rate: 95 });
    for (const r of out) expect(r).not.toHaveProperty("source");
  });
});

/**
 * Crew-mix rates are derived, not stored: `crewMixAverageRate` averages its
 * member roles' rates at the mix's schedule. Because it takes the rate list as
 * a parameter, feeding it resolved rates is all it takes for a mix to price at
 * a project's or version's overrides — no change to the mix itself. That
 * implicit coupling is worth a test: it's the thing that would silently break
 * if someone gave the grid the global book again.
 */
describe("crew-mix averages follow the resolved rates", () => {
  const members = [
    { roleName: "Pipefitter", count: 2 },
    { roleName: "Welder", count: 1 },
  ];

  it("averages at the global rates when nothing is overridden", () => {
    const rates = toPlainRates(resolveRoleRates({ global: GLOBAL }));
    // (68 × 2 + 91 × 1) / 3 = 75.67
    expect(crewMixAverageRate(members, "ST", rates)).toBeCloseTo(75.67, 1);
  });

  it("picks up a project override without the mix changing", () => {
    const rates = toPlainRates(
      resolveRoleRates({ global: GLOBAL, project: [rate("Welder", "ST", 121)] }),
    );
    // (68 × 2 + 121 × 1) / 3 = 85.67
    expect(crewMixAverageRate(members, "ST", rates)).toBeCloseTo(85.67, 1);
  });

  it("prices at a frozen version's rates over the project's", () => {
    const rates = toPlainRates(
      resolveRoleRates({
        global: GLOBAL,
        project: [rate("Welder", "ST", 121)],
        version: [rate("Welder", "ST", 100), rate("Pipefitter", "ST", 70)],
      }),
    );
    // (70 × 2 + 100 × 1) / 3 = 80
    expect(crewMixAverageRate(members, "ST", rates)).toBeCloseTo(80, 5);
  });
});

describe("resolveRoleIdRates", () => {
  const idRate = (roleId: number, schedule: string, rate: number) => ({
    roleId,
    schedule,
    rate,
  });

  it("applies the same precedence, keyed by role id", () => {
    const out = resolveRoleIdRates(
      [idRate(1, "ST", 68), idRate(2, "ST", 91)],
      [idRate(2, "ST", 95)],
    );
    expect(out).toContainEqual(idRate(1, "ST", 68));
    expect(out).toContainEqual(idRate(2, "ST", 95));
    expect(out).toHaveLength(2);
  });

  it("accepts a single layer — freezing a project resolves global alone", () => {
    const out = resolveRoleIdRates([idRate(1, "ST", 68)]);
    expect(out).toEqual([idRate(1, "ST", 68)]);
  });

  it("keeps rate rows for distinct schedules of the same role apart", () => {
    const out = resolveRoleIdRates([idRate(1, "ST", 68), idRate(1, "OT", 92)]);
    expect(out).toHaveLength(2);
  });

  it("does not confuse role id 1 / schedule '1' with role id 11", () => {
    // A naive concatenated key would fold these together.
    const out = resolveRoleIdRates([idRate(1, "1ST", 10), idRate(11, "ST", 20)]);
    expect(out).toHaveLength(2);
  });

  /**
   * The invariant that makes freezing trustworthy: the id-keyed path the
   * freeze action materializes with must produce the same rates the name-keyed
   * path the grid resolves with would have produced. If these drift, a freeze
   * silently changes the numbers it was supposed to preserve.
   */
  it("agrees with the name-keyed resolver on the same data", () => {
    const roles = [
      { id: 1, name: "Pipefitter" },
      { id: 2, name: "Welder" },
      { id: 3, name: "Electrician" },
    ];
    const nameOf = (id: number) => roles.find((r) => r.id === id)!.name;

    const globalById = [
      idRate(1, "ST", 68),
      idRate(1, "OT", 92),
      idRate(2, "ST", 91),
      idRate(3, "ST", 77),
    ];
    const projectById = [idRate(2, "ST", 95), idRate(3, "ST", 80)];

    const byId = resolveRoleIdRates(globalById, projectById);
    const byName = resolveRoleRates({
      global: globalById.map((r) => rate(nameOf(r.roleId), r.schedule, r.rate)),
      project: projectById.map((r) => rate(nameOf(r.roleId), r.schedule, r.rate)),
    });

    expect(
      byId.map((r) => ({ name: nameOf(r.roleId), s: r.schedule, rate: r.rate })),
    ).toEqual(byName.map((r) => ({ name: r.roleName, s: r.schedule, rate: r.rate })));
  });
});

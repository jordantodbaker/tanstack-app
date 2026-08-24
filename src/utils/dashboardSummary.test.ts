import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dashboard summary pushes ~30 numbers' worth of math into Postgres via
 * `aggregate` / `groupBy` instead of loading every CVR, FCO and RFI. Two things
 * are worth pinning:
 *
 *  - the PROJECTION — Prisma returns `_sum: null` for an empty set and returns
 *    groups in no particular order, so the handler has to coalesce and re-order
 *    into the lifecycle sequence the dashboard renders;
 *  - the PREDICATES — "overdue" means open AND past due, "work stopped" means
 *    stopped AND still open. Those are business rules, and they live in the
 *    `where` clauses rather than in any function a unit test would otherwise
 *    reach.
 *
 * Within `Promise.all` the calls fire in array order, so each model+method is
 * stubbed with an ordered `mockResolvedValueOnce` chain and its `where` clauses
 * are asserted from the recorded calls.
 */
const { prismaMock, requireAccess } = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  prismaMock: {
    changeLog: { aggregate: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    fieldChangeOrder: { aggregate: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    rfi: { count: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("../server/db", () => ({ prisma: prismaMock }));

vi.mock("./users.server", () => ({
  // Pass-through wrapper; the gate itself is covered in users.server.test.
  projectIdScopedHandler:
    (fn: (args: { data: number }) => unknown) => (args: { data: number }) => {
      requireAccess(args.data);
      return fn(args);
    },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const builder = {
      inputValidator(v: (d: unknown) => unknown) {
        validate = v;
        return builder;
      },
      handler(h: (args: { data: unknown }) => unknown) {
        return async (args?: { data: unknown }) => h({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

import { fetchDashboardSummary } from "./dashboardSummary";

const agg = (count: number, sums: Record<string, number | null> = {}) => ({
  _count: { _all: count },
  _sum: sums,
});

/** Every stub returns an empty/zero result; individual tests override. */
function stubAll() {
  prismaMock.changeLog.aggregate
    .mockResolvedValueOnce(
      agg(0, { costImpact: null, scheduleDaysImpact: null, laborHoursImpact: null }),
    )
    .mockResolvedValueOnce(agg(0, { costImpact: null }));
  prismaMock.changeLog.count
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0);
  prismaMock.changeLog.groupBy
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  prismaMock.fieldChangeOrder.aggregate.mockResolvedValueOnce(
    agg(0, { estimatedCost: null }),
  );
  prismaMock.fieldChangeOrder.count
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0);
  prismaMock.fieldChangeOrder.groupBy.mockResolvedValueOnce([]);
  prismaMock.rfi.count
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0);
  prismaMock.rfi.groupBy.mockResolvedValueOnce([]);
}

const run = () => fetchDashboardSummary({ data: 1 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("empty project", () => {
  it("coalesces Prisma's null sums to zero rather than leaking null", async () => {
    // `_sum` comes back null for an empty set; a null reaching the dashboard
    // renders as "$null" rather than "$0".
    stubAll();
    const out = await run();

    expect(out.cvr).toMatchObject({
      total: 0,
      netCost: 0,
      approvedCost: 0,
      scheduleDays: 0,
      laborHours: 0,
    });
    expect(out.fco.estCost).toBe(0);
  });

  it("returns empty breakdown arrays rather than a row per possible status", async () => {
    stubAll();
    const out = await run();

    expect(out.cvr.byStatus).toEqual([]);
    expect(out.cvr.byRisk).toEqual([]);
    expect(out.fco.byStatus).toEqual([]);
    expect(out.rfi.byStatus).toEqual([]);
  });
});

describe("status breakdowns", () => {
  it("orders CVR statuses by lifecycle, not by what Postgres returned", async () => {
    stubAll();
    prismaMock.changeLog.groupBy.mockReset();
    prismaMock.changeLog.groupBy
      // Deliberately out of lifecycle order.
      .mockResolvedValueOnce([
        { status: "EXECUTED", _count: { _all: 2 }, _sum: { costImpact: 200 } },
        { status: "REQUESTED", _count: { _all: 1 }, _sum: { costImpact: 100 } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const out = await run();

    expect(out.cvr.byStatus.map((b) => b.status)).toEqual([
      "REQUESTED",
      "EXECUTED",
    ]);
    expect(out.cvr.byStatus.map((b) => b.cost)).toEqual([100, 200]);
  });

  it("drops statuses with no rows", async () => {
    stubAll();
    prismaMock.changeLog.groupBy.mockReset();
    prismaMock.changeLog.groupBy
      .mockResolvedValueOnce([
        { status: "APPROVED", _count: { _all: 3 }, _sum: { costImpact: 0 } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const out = await run();

    expect(out.cvr.byStatus).toEqual([
      { status: "APPROVED", count: 3, cost: 0 },
    ]);
  });

  it("orders risk levels low → critical", async () => {
    stubAll();
    prismaMock.changeLog.groupBy.mockReset();
    prismaMock.changeLog.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { riskLevel: "CRITICAL", _count: { _all: 1 } },
        { riskLevel: "LOW", _count: { _all: 5 } },
        { riskLevel: "HIGH", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([]);

    const out = await run();

    expect(out.cvr.byRisk).toEqual([
      { level: "LOW", count: 5 },
      { level: "HIGH", count: 2 },
      { level: "CRITICAL", count: 1 },
    ]);
  });

  it("sorts disciplines by ABSOLUTE cost so large credits rank too", async () => {
    // A -500k credit matters as much as a +500k add; sorting on the raw value
    // would bury it at the bottom.
    stubAll();
    prismaMock.changeLog.groupBy.mockReset();
    prismaMock.changeLog.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { discipline: "civil", _sum: { costImpact: 100 } },
        { discipline: "piping", _sum: { costImpact: -900 } },
        { discipline: "electrical", _sum: { costImpact: 400 } },
      ]);

    const out = await run();

    expect(out.cvr.byDiscipline.map((d) => d.discipline)).toEqual([
      "piping",
      "electrical",
      "civil",
    ]);
  });

  it("coalesces a null discipline sum to zero", async () => {
    stubAll();
    prismaMock.changeLog.groupBy.mockReset();
    prismaMock.changeLog.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ discipline: "civil", _sum: { costImpact: null } }]);

    const out = await run();

    expect(out.cvr.byDiscipline).toEqual([{ discipline: "civil", cost: 0 }]);
  });
});

describe("query predicates", () => {
  it("counts approved cost from APPROVED and EXECUTED together", async () => {
    stubAll();
    await run();

    const approvedAgg = prismaMock.changeLog.aggregate.mock.calls[1][0];
    expect(approvedAgg.where.status.in).toEqual(["APPROVED", "EXECUTED"]);
  });

  it("counts an overdue CVR only while it is still open", async () => {
    stubAll();
    await run();

    // 3rd changeLog.count is cvrOverdue.
    const where = prismaMock.changeLog.count.mock.calls[2][0].where;
    expect(where.status.in).toEqual(["REQUESTED", "IN_REVIEW", "PENDING_APPROVAL"]);
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  it("counts work-stopped FCOs only while they are still open", async () => {
    stubAll();
    await run();

    // 2nd fieldChangeOrder.count is fcoWorkStoppedOpen.
    const where = prismaMock.fieldChangeOrder.count.mock.calls[1][0].where;
    expect(where.workStopped).toBe(true);
    expect(where.status.in).toEqual([
      "DRAFT",
      "SUBMITTED",
      "IN_REVIEW",
      "LINKED_TO_CVR",
    ]);
  });

  it("treats an RFI as suspecting impact on cost OR schedule", async () => {
    stubAll();
    await run();

    // 5th rfi.count is rfiSuspectsImpact.
    const where = prismaMock.rfi.count.mock.calls[4][0].where;
    expect(where.OR).toEqual([
      { suspectsCostImpact: true },
      { suspectsScheduleImpact: true },
    ]);
    expect(where.status.in).toEqual(["DRAFT", "OPEN", "ANSWERED"]);
  });

  it("uses the start of today as the past-due boundary", async () => {
    stubAll();
    await run();

    const boundary: Date =
      prismaMock.changeLog.count.mock.calls[2][0].where.dueDate.lt;
    expect(boundary.getHours()).toBe(0);
    expect(boundary.getMinutes()).toBe(0);
    expect(boundary.getSeconds()).toBe(0);
    expect(boundary.getMilliseconds()).toBe(0);
  });

  it("scopes every aggregation to the requested project", async () => {
    stubAll();
    await run();

    const everyCall = [
      ...prismaMock.changeLog.aggregate.mock.calls,
      ...prismaMock.changeLog.count.mock.calls,
      ...prismaMock.changeLog.groupBy.mock.calls,
      ...prismaMock.fieldChangeOrder.aggregate.mock.calls,
      ...prismaMock.fieldChangeOrder.count.mock.calls,
      ...prismaMock.fieldChangeOrder.groupBy.mock.calls,
      ...prismaMock.rfi.count.mock.calls,
      ...prismaMock.rfi.groupBy.mock.calls,
    ];
    // 19 aggregations: 8 CVR, 5 FCO, 6 RFI.
    expect(everyCall).toHaveLength(19);
    for (const [arg] of everyCall) {
      expect(arg.where.projectId).toBe(1);
    }
  });
});

describe("attention panel", () => {
  it("reuses the same numbers the per-entity sections report", async () => {
    stubAll();
    prismaMock.changeLog.count.mockReset();
    prismaMock.changeLog.count
      .mockResolvedValueOnce(4) // cvrOpen
      .mockResolvedValueOnce(2) // cvrPendingApproval
      .mockResolvedValueOnce(1); // cvrOverdue
    prismaMock.fieldChangeOrder.count.mockReset();
    prismaMock.fieldChangeOrder.count
      .mockResolvedValueOnce(6) // fcoOpen
      .mockResolvedValueOnce(3) // fcoWorkStoppedOpen
      .mockResolvedValueOnce(5); // fcoOverdue
    prismaMock.rfi.count.mockReset();
    prismaMock.rfi.count
      .mockResolvedValueOnce(9) // rfiTotal
      .mockResolvedValueOnce(7) // rfiOpen
      .mockResolvedValueOnce(2) // rfiAnswered
      .mockResolvedValueOnce(1) // rfiPastDue
      .mockResolvedValueOnce(0); // rfiSuspectsImpact

    const out = await run();

    expect(out.attention).toEqual({
      pendingApproval: 2,
      overdueCvr: 1,
      overdueFco: 5,
      workStopped: 3,
      rfiAwaitingClose: 2,
      rfiPastDue: 1,
    });
    // The same counts must not diverge between the two panels.
    expect(out.fco.workStopped).toBe(out.attention.workStopped);
    expect(out.rfi.awaitingClose).toBe(out.attention.rfiAwaitingClose);
    expect(out.rfi.pastDue).toBe(out.attention.rfiPastDue);
  });
});

describe("access control", () => {
  it("gates on the requested project", async () => {
    stubAll();
    await run();
    expect(requireAccess).toHaveBeenCalledWith(1);
  });

  it("rejects a non-positive projectId at the validator", async () => {
    await expect(fetchDashboardSummary({ data: 0 })).rejects.toThrow();
    expect(prismaMock.changeLog.aggregate).not.toHaveBeenCalled();
  });
});

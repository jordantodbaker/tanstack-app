import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * Applying a labor-rate refresh rewrites `laborRate` on every drifted row of a
 * revision at once. The planner (`~/lib/rate-refresh`) is tested on its own;
 * what is pinned here is the part that actually writes, where a regression
 * silently reprices an issued estimate:
 *
 *  - APPROVER gates the write, and a refusal writes nothing at all;
 *  - an empty plan is a true no-op — no update, no audit row;
 *  - the plan is recomputed server-side, never taken from the caller;
 *  - every write goes through the transaction client, so a sheet is never
 *    left half re-rated;
 *  - each row gets an audit entry, and a row that had no rate yet records
 *    `null` rather than the empty string.
 *
 * The planner and the audit writer are deliberately NOT mocked: the point is
 * that this pair produces the right writes from real rate resolution.
 */
const { prismaMock, txMock, transaction, requireVersionAccessFn } = vi.hoisted(
  () => ({
    transaction: vi.fn(),
    requireVersionAccessFn: vi.fn(),
    // The transaction client is a DISTINCT object from `prisma` so the tests
    // can tell the two apart. A write landing on `prisma` here would escape
    // the transaction and break atomicity while still passing a naive
    // assertion that "updateMany was called".
    txMock: {
      fefRow: { updateMany: vi.fn() },
      auditEvent: { createMany: vi.fn() },
    },
    prismaMock: {
      fefRow: { findMany: vi.fn(), updateMany: vi.fn() },
      roleRate: { findMany: vi.fn() },
      projectRoleRate: { findMany: vi.fn() },
      versionRoleRate: { findMany: vi.fn() },
      crewMix: { findMany: vi.fn() },
      auditEvent: { createMany: vi.fn() },
      $transaction: vi.fn(),
    },
  }),
);

vi.mock("../server/db", () => ({ prisma: prismaMock }));

vi.mock("./users.server", () => ({
  requireVersionAccess: requireVersionAccessFn,
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
        return async (args?: { data: unknown }) =>
          h({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

import {
  applyVersionRateRefresh,
  previewVersionRateRefresh,
} from "./rateRefresh";

const approver: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "approver@example.com",
  role: "APPROVER",
};
const estimator: CurrentUser = { ...approver, role: "USER" };

/**
 * Ironworker went to 150; Pipefitter is unchanged at 100.
 *
 * Rows 1 and 2 drifted from the same stored rate, so they group. Row 3 is
 * already correct. Row 4 never carried a rate. Row 5 is a craft that is no
 * longer in the book at all.
 */
const GLOBAL = [
  { schedule: "ST", rate: 150, role: { name: "Ironworker" } },
  { schedule: "ST", rate: 100, role: { name: "Pipefitter" } },
];

const ROWS = [
  { id: 1, role: "Ironworker", schedule: "ST", crewMixId: "", laborRate: "120", laborHours: "10" },
  { id: 2, role: "Ironworker", schedule: "ST", crewMixId: "", laborRate: "120", laborHours: "5" },
  { id: 3, role: "Pipefitter", schedule: "ST", crewMixId: "", laborRate: "100", laborHours: "8" },
  { id: 4, role: "Ironworker", schedule: "ST", crewMixId: "", laborRate: "", laborHours: "2" },
  { id: 5, role: "Retired Craft", schedule: "ST", crewMixId: "", laborRate: "77", laborHours: "1" },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireVersionAccessFn.mockResolvedValue({ projectId: 42, actor: approver });

  prismaMock.fefRow.findMany.mockResolvedValue(ROWS);
  prismaMock.roleRate.findMany.mockResolvedValue(GLOBAL);
  prismaMock.projectRoleRate.findMany.mockResolvedValue([]);
  prismaMock.versionRoleRate.findMany.mockResolvedValue([]);
  prismaMock.crewMix.findMany.mockResolvedValue([]);
  txMock.fefRow.updateMany.mockResolvedValue({ count: 0 });
  txMock.auditEvent.createMany.mockResolvedValue({ count: 0 });

  prismaMock.$transaction = transaction;
  transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fn: (t: any) => Promise<unknown>) => fn(txMock),
  );
});

describe("applyVersionRateRefresh", () => {
  const run = () => applyVersionRateRefresh({ data: { versionId: 5 } });

  it("rewrites only the drifted rows, grouped by stored rate", async () => {
    await expect(run()).resolves.toEqual({ rowsUpdated: 3 });

    // Row 3 is already correct and row 5 is unpriced, so neither is touched.
    const calls = txMock.fefRow.updateMany.mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(2);
    expect(calls).toContainEqual({
      where: { id: { in: [1, 2] } },
      data: { laborRate: "150" },
    });
    expect(calls).toContainEqual({
      where: { id: { in: [4] } },
      data: { laborRate: "150" },
    });
  });

  it("leaves a row alone when its craft is no longer in the rate book", async () => {
    // Blanking it would be worse than leaving it stale: the estimate would
    // lose a number nobody asked it to drop.
    await run();
    const touched = txMock.fefRow.updateMany.mock.calls.flatMap(
      (c) => c[0].where.id.in,
    );
    expect(touched).not.toContain(5);
  });

  it("records one audit row per line item, a blank stored rate as null", async () => {
    await run();

    const data = txMock.auditEvent.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(3);

    const byEntity = new Map(
      data.map((d: { entityId: number }) => [d.entityId, d]),
    );
    expect(byEntity.get(1)).toMatchObject({
      entityType: "FefRow",
      projectId: 42,
      field: "laborRate",
      oldValue: "120",
      newValue: "150",
      actorId: 7,
    });
    // An empty stored rate means "never priced", not a rate of zero.
    expect(byEntity.get(4)).toMatchObject({ oldValue: null, newValue: "150" });
  });

  it("writes nothing at all when nothing drifted", async () => {
    prismaMock.fefRow.findMany.mockResolvedValue([ROWS[2]]);

    await expect(run()).resolves.toEqual({ rowsUpdated: 0 });
    expect(txMock.fefRow.updateMany).not.toHaveBeenCalled();
    expect(txMock.auditEvent.createMany).not.toHaveBeenCalled();
  });

  it("re-plans from a fresh read instead of trusting the caller", async () => {
    // The preview someone approved may be minutes old, and the rows it named
    // could have moved since, so apply reads them again.
    await run();
    expect(prismaMock.fefRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { versionId: 5 } }),
    );
  });

  it("puts every write on the transaction client", async () => {
    // A bare `prisma.` write here would commit on its own connection and
    // survive a rollback, leaving the revision half re-rated.
    await run();
    expect(txMock.fefRow.updateMany).toHaveBeenCalled();
    expect(prismaMock.fefRow.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditEvent.createMany).not.toHaveBeenCalled();
  });

  it("requires APPROVER, and refuses before opening a transaction", async () => {
    requireVersionAccessFn.mockResolvedValue({
      projectId: 42,
      actor: estimator,
    });

    await expect(run()).rejects.toThrow(/requires APPROVER/);
    expect(transaction).not.toHaveBeenCalled();
    expect(txMock.fefRow.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a non-positive versionId at the validator", async () => {
    await expect(
      applyVersionRateRefresh({ data: { versionId: 0 } }),
    ).rejects.toThrow();
    expect(requireVersionAccessFn).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("crew-mix rows", () => {
  /** Two ironworkers and a pipefitter: (150×2 + 100×1) / 3 = 133.33. */
  const GANG = {
    id: 9,
    name: "Pipe Gang",
    schedule: "ST",
    members: [
      { count: 2, role: { name: "Ironworker" } },
      { count: 1, role: { name: "Pipefitter" } },
    ],
  };

  beforeEach(() => {
    prismaMock.crewMix.findMany.mockResolvedValue([GANG]);
  });

  it("re-averages the mix and labels the change by crew", async () => {
    prismaMock.fefRow.findMany.mockResolvedValue([
      { id: 11, role: "", schedule: "", crewMixId: "9", laborRate: "120", laborHours: "4" },
    ]);

    const plan = await previewVersionRateRefresh({ data: { versionId: 5 } });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      label: "Crew: Pipe Gang",
      storedRate: "120",
      newRate: "133.33",
    });

    await applyVersionRateRefresh({ data: { versionId: 5 } });
    expect(txMock.fefRow.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [11] } },
      data: { laborRate: "133.33" },
    });
  });

  it("takes the mix over a stale role and schedule on the same row", async () => {
    // Picking a crew mix clears role/schedule in the grid, but a row written
    // before that behavior existed can still carry both. The mix is the
    // deliberate choice, so it wins.
    prismaMock.fefRow.findMany.mockResolvedValue([
      { id: 12, role: "Pipefitter", schedule: "ST", crewMixId: "9", laborRate: "100", laborHours: "1" },
    ]);

    const plan = await previewVersionRateRefresh({ data: { versionId: 5 } });
    expect(plan.changes[0]).toMatchObject({
      label: "Crew: Pipe Gang",
      newRate: "133.33",
    });
  });

  it("skips a row whose mix no longer prices at its schedule", async () => {
    // An empty mix averages to nothing. Stamping 0 would zero out real money.
    prismaMock.crewMix.findMany.mockResolvedValue([
      { ...GANG, members: [] },
    ]);
    prismaMock.fefRow.findMany.mockResolvedValue([
      { id: 13, role: "", schedule: "", crewMixId: "9", laborRate: "120", laborHours: "4" },
    ]);

    await expect(
      applyVersionRateRefresh({ data: { versionId: 5 } }),
    ).resolves.toEqual({ rowsUpdated: 0 });
    expect(txMock.fefRow.updateMany).not.toHaveBeenCalled();
  });
});

describe("previewVersionRateRefresh", () => {
  const run = () => previewVersionRateRefresh({ data: { versionId: 5 } });

  it("returns the plan, ordered by cost impact, without writing", async () => {
    const plan = await run();

    expect(plan.rowCount).toBe(3);
    // (150-120)*10 + (150-120)*5 = 450, ahead of (150-0)*2 = 300.
    expect(plan.changes.map((c) => c.rowIds)).toEqual([[1, 2], [4]]);
    expect(plan.totalDelta).toBe(750);
    expect(transaction).not.toHaveBeenCalled();
    expect(txMock.fefRow.updateMany).not.toHaveBeenCalled();
  });

  it("is readable without APPROVER", async () => {
    // Deliberate: seeing what a refresh WOULD do is harmless, and an estimator
    // needs it to decide whether to ask for one. Only apply is gated.
    requireVersionAccessFn.mockResolvedValue({
      projectId: 42,
      actor: estimator,
    });
    await expect(run()).resolves.toMatchObject({ rowCount: 3 });
  });

  it("still requires access to the version's project", async () => {
    requireVersionAccessFn.mockRejectedValue(new Error("Forbidden: no access"));
    await expect(run()).rejects.toThrow(/Forbidden/);
    expect(prismaMock.fefRow.findMany).not.toHaveBeenCalled();
  });
});

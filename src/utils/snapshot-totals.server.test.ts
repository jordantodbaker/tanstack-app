import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, update } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../server/db", () => ({
  prisma: { estimateSnapshot: { findMany, update } },
}));

import {
  backfillSnapshotTotals,
  hasCurrentTotals,
  snapshotTotals,
  snapshotTotalsById,
} from "./snapshot-totals.server";

/**
 * One place recomputes an old snapshot's totals; these pin that the cache is
 * used when it is current, that every stale snapshot is recomputed in one
 * query, and that the backfill touches only what is stale.
 */

const current = { laborByL1: { "100": 5 } };
// One take-off line: 10 h × $50 = $500 of labor on L1 100.
const row = {
  discipline: "civil",
  section: "TAKE_OFF",
  cbsCode: "100-00-0000-00-L",
  quantity: "1",
  laborHours: "10",
  laborRate: "50",
  materialCost: "0",
};

beforeEach(() => {
  findMany.mockReset();
  update.mockReset();
});

describe("hasCurrentTotals", () => {
  it("wants the per-L1 buckets, not just a non-null cache", () => {
    expect(hasCurrentTotals(current)).toBe(true);
    expect(hasCurrentTotals({ laborByDigit: {} })).toBe(false);
    expect(hasCurrentTotals(null)).toBe(false);
  });
});

describe("snapshotTotalsById", () => {
  it("uses the cache where current and recomputes the rest in one query", async () => {
    findMany.mockResolvedValue([
      { id: 2, fefRows: [row] },
      { id: 3, fefRows: null },
    ]);
    const byId = await snapshotTotalsById([
      { id: 1, totals: current },
      { id: 2, totals: null },
      { id: 3, totals: { laborByDigit: {} } },
      { id: 2, totals: null }, // a snapshot behind two periods is read once
    ]);
    expect(byId.get(1)).toBe(current);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: [2, 3] } });
    expect(byId.get(2)?.laborByL1).toEqual({ "100": 500 });
    expect(byId.get(3)?.laborByL1).toEqual({});
  });

  it("runs no query when every cache is current", async () => {
    await snapshotTotalsById([{ id: 1, totals: current }]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("snapshotTotals is the single-snapshot form", async () => {
    findMany.mockResolvedValue([{ id: 9, fefRows: [row] }]);
    expect((await snapshotTotals({ id: 9, totals: null })).laborByL1).toEqual({
      "100": 500,
    });
    expect(await snapshotTotals({ id: 1, totals: current })).toBe(current);
  });
});

describe("backfillSnapshotTotals", () => {
  it("writes the recomputed cache onto stale snapshots only", async () => {
    findMany.mockResolvedValue([
      { id: 1, totals: current, fefRows: [] },
      { id: 2, totals: null, fefRows: [row] },
    ]);
    update.mockResolvedValue({});
    await expect(backfillSnapshotTotals()).resolves.toEqual({
      total: 2,
      backfilled: 1,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: 2 });
    expect(update.mock.calls[0][0].data.totals.laborByL1).toEqual({
      "100": 500,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFefRow } from "~/lib/fef-helpers";
import type { FefRow } from "~/lib/types";

/**
 * `saveFefRows` is the grid's autosave endpoint, and the one path in this
 * codebase with a recorded history of data loss — its own comments note that
 * "three sheets of work have gone missing with the save reporting success".
 *
 * The guard that came out of that is the interesting behavior: a save carrying
 * no persistable rows would delete the whole (version, discipline, section),
 * which is right when a user empties a sheet and catastrophic when a grid
 * submits a sheet it never loaded. So the delete only happens with an explicit
 * `allowClear`; otherwise the server refuses and hands back what is on disk so
 * the client's cache re-syncs to reality rather than to its own blank.
 *
 * Prisma and the access check are mocked — this is about the decision logic
 * around the write, not the SQL.
 */
const {
  prismaMock,
  transaction,
  findMany,
  deleteMany,
  executeRaw,
  txFindMany,
  requireVersionAccessFn,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  executeRaw: vi.fn(),
  txFindMany: vi.fn(),
  requireVersionAccessFn: vi.fn(),
  prismaMock: {
    fefRow: { findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../server/db", () => ({ prisma: prismaMock }));

/**
 * `createServerFn(...).inputValidator(v).handler(h)` normally returns an RPC
 * stub — calling it in-process doesn't run `h`. This stand-in returns a plain
 * async function that validates then calls the handler, so the tests drive the
 * real handler AND the real Zod schema, which is the boundary that matters.
 */
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

vi.mock("./users.server", () => ({
  requireVersionAccess: requireVersionAccessFn,
  // `saveFefRows` doesn't use it, but the module imports it at load time.
  versionScopedHandler:
    (fn: (args: { data: unknown }) => unknown) => (args: { data: unknown }) =>
      fn(args),
}));

vi.mock("~/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createDebug: () => vi.fn(),
}));

import { saveFefRows } from "./fefRows";

const BASE = { versionId: 1, discipline: "piping", section: "TAKE_OFF" } as const;

/** A blank template row the grid pads the sheet with — no user data. */
const blank = (i: number): FefRow => makeFefRow({ id: `__fe-blank-${i}` });
/** A row the user actually typed into. */
const filled = (id: string, description: string): FefRow =>
  makeFefRow({ id, description });

/** What a persisted row looks like coming back from `findMany`. */
const dbRow = (id: number, cbsCode: string, position: number) => ({
  ...makeFefRow({ id: "" }),
  id,
  cbsCode,
  position,
});

const save = (rows: FefRow[], allowClear?: boolean) =>
  saveFefRows({ data: { ...BASE, rows, ...(allowClear ? { allowClear } : {}) } });

beforeEach(() => {
  vi.clearAllMocks();
  requireVersionAccessFn.mockResolvedValue({ projectId: 7, actor: { id: 1 } });
  prismaMock.fefRow.findMany = findMany;
  prismaMock.fefRow.deleteMany = deleteMany;
  findMany.mockResolvedValue([]);
  deleteMany.mockResolvedValue({ count: 0 });
  executeRaw.mockResolvedValue(0);
  txFindMany.mockResolvedValue([]);
  prismaMock.$transaction = transaction;
  transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fn: (t: any) => Promise<unknown>) =>
      fn({ $executeRaw: executeRaw, fefRow: { findMany: txFindMany } }),
  );
});

describe("the unconfirmed-wipe guard", () => {
  it("refuses to delete a populated sheet without allowClear", async () => {
    const existing = [dbRow(10, "611-A", 0), dbRow(11, "611-B", 1)];
    findMany.mockResolvedValue(existing);

    const out = await save([blank(0)]);

    // Nothing deleted, and the caller gets the server's rows back so its cache
    // re-syncs to reality instead of to the blank it just sent.
    expect(deleteMany).not.toHaveBeenCalled();
    expect(out.map((r) => r.id)).toEqual(["611-A", "611-B"]);
  });

  it("deletes the sheet when the client confirms with allowClear", async () => {
    findMany.mockResolvedValue([dbRow(10, "611-A", 0)]);

    const out = await save([blank(0)], true);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { versionId: 1, discipline: "piping", section: "TAKE_OFF" },
    });
    expect(out).toEqual([]);
  });

  it("is a harmless no-op when the sheet is already empty", async () => {
    findMany.mockResolvedValue([]);

    const out = await save([blank(0)]);

    // No existing rows means there is nothing to protect — the delete runs but
    // removes nothing, and no refusal is needed.
    expect(out).toEqual([]);
  });

  it("never reaches the guard when the payload has real rows", async () => {
    txFindMany.mockResolvedValue([dbRow(1, "611-A", 0)]);

    await save([filled("611-A", "pump")]);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalled();
  });
});

describe("which rows get persisted", () => {
  /** Pulls the rows the handler decided to write, via the position DELETE. */
  const persistedCount = () => {
    // The trailing DELETE is `"position" >= persistable.length`; its last
    // interpolated value is that count.
    const call = executeRaw.mock.calls[1];
    return call[call.length - 1];
  };

  it("drops blank template rows that carry no user data", async () => {
    txFindMany.mockResolvedValue([]);

    await save([filled("611-A", "pump"), blank(1), blank(2)]);

    expect(persistedCount()).toBe(1);
  });

  it("keeps a blank-id row once the user has typed into it", async () => {
    txFindMany.mockResolvedValue([]);

    await save([blank(0), makeFefRow({ id: "__fe-blank-1", description: "x" })]);

    expect(persistedCount()).toBe(1);
  });

  it("assigns positions by post-filter array order", async () => {
    txFindMany.mockResolvedValue([]);

    await save([
      blank(0),
      filled("611-A", "a"),
      blank(1),
      filled("611-B", "b"),
      filled("611-C", "c"),
    ]);

    // Three survivors → positions 0,1,2 → the DELETE trims from 3 up.
    expect(persistedCount()).toBe(3);
  });
});

describe("client id ↔ cbsCode round-trip", () => {
  it("maps a stored blank cbsCode back to a synthetic client id", async () => {
    // A row the user typed into but never assigned a CBS code to persists with
    // cbsCode "". On read it needs a stable, unique client id or React keys
    // collide across every such row.
    txFindMany.mockResolvedValue([dbRow(42, "", 0), dbRow(43, "", 1)]);

    const out = await save([filled("611-A", "pump")]);

    expect(out.map((r) => r.id)).toEqual([
      "__fe-blank-loaded-42",
      "__fe-blank-loaded-43",
    ]);
  });

  it("passes a real CBS code straight through as the client id", async () => {
    txFindMany.mockResolvedValue([dbRow(42, "611-A", 0)]);

    const out = await save([filled("611-A", "pump")]);

    expect(out[0].id).toBe("611-A");
  });

  it("does not leak the DB primary key or position into the client row", async () => {
    txFindMany.mockResolvedValue([dbRow(42, "611-A", 0)]);

    const out = await save([filled("611-A", "pump")]);

    expect(out[0]).not.toHaveProperty("position");
    expect(out[0].id).toBe("611-A");
  });
});

describe("access control", () => {
  it("authorizes the version before touching any row", async () => {
    txFindMany.mockResolvedValue([]);

    await save([filled("611-A", "pump")]);

    expect(requireVersionAccessFn).toHaveBeenCalledWith(1);
  });

  it("writes nothing when the version check throws", async () => {
    requireVersionAccessFn.mockRejectedValue(
      new Error("Forbidden: no access to project 7"),
    );

    await expect(save([filled("611-A", "pump")])).rejects.toThrow("Forbidden");
    expect(transaction).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("the write transaction", () => {
  it("upserts and trims stale positions inside one transaction", async () => {
    txFindMany.mockResolvedValue([dbRow(1, "611-A", 0)]);

    await save([filled("611-A", "pump")]);

    // One transaction; an INSERT…ON CONFLICT plus the trailing position DELETE.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const insertSql = executeRaw.mock.calls[0][0].join("");
    expect(insertSql).toContain("ON CONFLICT");
    const deleteSql = executeRaw.mock.calls[1][0].join("");
    expect(deleteSql).toContain("DELETE FROM");
  });

  it("re-reads the saved rows in position order", async () => {
    txFindMany.mockResolvedValue([]);

    await save([filled("611-A", "pump")]);

    expect(txFindMany).toHaveBeenCalledWith({
      where: { versionId: 1, discipline: "piping", section: "TAKE_OFF" },
      orderBy: { position: "asc" },
    });
  });
});

describe("custom-column slots reach the write path", () => {
  it("persists a row whose ONLY content is a custom column", async () => {
    // The design bet: because the slots are ordinary FEF_ROW_STRING_FIELDS
    // entries, `fefRowHasUserData` sees them and the row is not discarded as a
    // blank template row. If this breaks, an estimator fills a custom column,
    // autosave runs, and the row silently disappears.
    txFindMany.mockResolvedValue([]);

    await save([
      makeFefRow({ id: "__fe-blank-0", custom1: "CT-4471" }),
      blank(1),
    ]);

    // One persistable row -> the trailing DELETE trims from position 1.
    const del = executeRaw.mock.calls[1];
    expect(del[del.length - 1]).toBe(1);
  });

  it("includes the slots in the generated INSERT column list", async () => {
    txFindMany.mockResolvedValue([]);
    await save([filled("611-A", "pump")]);
    // The column list is a `Prisma.raw` VALUE interpolated into the template,
    // not part of its static strings — so read it off the interpolation.
    const [, columnList] = executeRaw.mock.calls[0];
    const sql = JSON.stringify(columnList);
    expect(sql).toContain("custom1");
    expect(sql).toContain("custom10");
  });
});

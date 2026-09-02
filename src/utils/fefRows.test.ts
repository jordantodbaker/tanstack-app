import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFefRow } from "~/lib/fef-helpers";

/**
 * The sheet-wipe guard.
 *
 * `saveFefRows` replaces a sheet wholesale, so an empty payload means "delete
 * everything here". That is a legitimate thing for a user to ask for and a
 * catastrophic thing to do by accident — and it HAS happened twice, a render
 * loop emptying the grid and the save writing it through as success (144 rows
 * of steel, 444 of piping). These tests pin the condition that separates the
 * two: `allowClear`, which the client sets only when the user removed rows.
 */
const { prismaMock, requireVersionAccessFn, loggerMock } = vi.hoisted(() => ({
  requireVersionAccessFn: vi.fn(),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  prismaMock: {
    fefRow: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("../server/db", () => ({ prisma: prismaMock }));
vi.mock("./users.server", () => ({
  requireVersionAccess: requireVersionAccessFn,
  requireProjectAccess: vi.fn(),
  // Used by the read path in the same module; pass the handler straight through.
  versionScopedHandler: (h: unknown) => h,
}));
vi.mock("~/lib/logger", () => ({ logger: loggerMock }));
vi.mock("../lib/logger", () => ({ logger: loggerMock }));
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

const { saveFefRows } = await import("./fefRows");

/** A populated sheet as the DB would return it. */
const onDisk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    ...makeFefRow({}),
    // DB shape: numeric primary key, with the CBS code in its own column.
    id: i + 1,
    projectId: 1,
    versionId: 7,
    discipline: "steel",
    section: "TAKE_OFF",
    position: i,
    cbsCode: `300-0${i}`,
  }));

const save = (over: Record<string, unknown> = {}) =>
  saveFefRows({
    data: {
      versionId: 7,
      discipline: "steel",
      section: "TAKE_OFF",
      rows: [],
      ...over,
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireVersionAccessFn.mockResolvedValue({ projectId: 1 });
  prismaMock.fefRow.findMany.mockResolvedValue(onDisk(120));
  prismaMock.fefRow.deleteMany.mockResolvedValue({ count: 120 });
});

describe("saveFefRows — emptying a populated sheet", () => {
  it("REFUSES when the client did not authorize a clear", () => {
    // The bug this exists for: a grid emptied by a fault, not by a person.
    return save({ allowClear: false }).then((returned) => {
      expect(prismaMock.fefRow.deleteMany).not.toHaveBeenCalled();
      // Hands back what is on disk so the caller's cache re-syncs to reality
      // rather than to its own blank slate.
      expect(returned).toHaveLength(120);
    });
  });

  it("REFUSES when the flag is absent entirely", async () => {
    await save();
    expect(prismaMock.fefRow.deleteMany).not.toHaveBeenCalled();
  });

  it("logs the refusal loudly — it means a client tried to destroy a sheet", async () => {
    await save({ allowClear: false });
    expect(loggerMock.error).toHaveBeenCalledWith(
      "saveFefRows refused an unconfirmed sheet wipe",
      expect.objectContaining({ existingRows: 120, discipline: "steel" }),
    );
  });

  it("ALLOWS the clear when the user removed the rows", async () => {
    const returned = await save({ allowClear: true });
    expect(prismaMock.fefRow.deleteMany).toHaveBeenCalledWith({
      where: { versionId: 7, discipline: "steel", section: "TAKE_OFF" },
    });
    expect(returned).toEqual([]);
  });

  it("does not need the flag when the sheet is already empty", async () => {
    // Nothing to lose, so an empty save is a no-op rather than a refusal.
    prismaMock.fefRow.findMany.mockResolvedValue([]);
    await save({ allowClear: false });
    expect(prismaMock.fefRow.deleteMany).toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("treats blank template rows as empty, and still refuses", async () => {
    // A grid holding only its trailing blank buffer is an empty sheet as far
    // as persistence is concerned — the guard has to cover that shape too.
    await save({
      rows: [makeFefRow({ id: "__fe-blank-1" }), makeFefRow({ id: "__fe-blank-2" })],
      allowClear: false,
    });
    expect(prismaMock.fefRow.deleteMany).not.toHaveBeenCalled();
  });
});

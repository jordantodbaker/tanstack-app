import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  resetTestDb,
  disconnectTestPrisma,
} from "~/test/integration-db";

/**
 * The autosave upsert against real Postgres. The unit tests can only check
 * the SQL's text; these check what it DOES — chiefly that a save rewrites
 * only the rows whose data changed, since autosave sends the whole section on
 * every keystroke burst, and that a section larger than one INSERT batch
 * still saves whole.
 *
 * `saveFefRows` itself runs, against the test database: the Prisma singleton
 * is pointed at it and the version-access check is stubbed.
 *
 * Skipped unless TEST_DATABASE_URL is set — see docs/integration-testing.md.
 */
vi.mock("~/server/db", async () => {
  const { getTestPrisma } = await import("~/test/integration-db");
  // A getter, so a skipped run (no TEST_DATABASE_URL) never builds a client.
  return {
    get prisma() {
      return getTestPrisma();
    },
  };
});
const { requireVersionAccess } = vi.hoisted(() => ({
  requireVersionAccess: vi.fn(),
}));
vi.mock("./users.server", () => ({
  requireVersionAccess,
  versionScopedHandler: (h: unknown) => h,
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

import { FEF_UPSERT_BATCH_ROWS, saveFefRows } from "./fefRows";
import { makeFefRow } from "~/lib/fef-helpers";
import type { FefRow } from "~/lib/types";

describeIntegration("integration: FefRow autosave upsert", () => {
  let db: ReturnType<typeof getTestPrisma>;
  let versionId: number;

  beforeAll(() => {
    db = getTestPrisma();
  });
  beforeEach(async () => {
    await resetTestDb();
    const project = await db.project.create({
      data: { displayId: "1901", name: "Test", description: "" },
    });
    const version = await db.estimateVersion.create({
      data: { projectId: project.id, versionNumber: 1 },
    });
    versionId = version.id;
    requireVersionAccess.mockResolvedValue({ projectId: project.id });
  });
  afterAll(() => disconnectTestPrisma());

  const sheet = (n: number): FefRow[] =>
    Array.from({ length: n }, (_, i) =>
      makeFefRow({
        id: `601-${String(i).padStart(2, "0")}-0000-00-L`,
        description: `row ${i}`,
        laborHours: "10",
        laborRate: "100",
      }),
    );
  const save = (rows: FefRow[]) =>
    saveFefRows({
      data: { versionId, discipline: "piping", section: "TAKE_OFF", rows },
    });
  const stored = () =>
    db.fefRow.findMany({
      where: { versionId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, description: true, updatedAt: true },
    });

  it("leaves unchanged rows untouched and rewrites only the edited one", async () => {
    const rows = sheet(20);
    await save(rows);
    const before = await stored();

    // Let the clock move, so a rewrite would show in updatedAt.
    await new Promise((r) => setTimeout(r, 50));
    const edited = rows.map((r, i) =>
      i === 7 ? { ...r, description: "edited" } : r,
    );
    await save(edited);
    const after = await stored();

    // Same rows, same primary keys — an upsert, not a wipe-and-recreate.
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after[7].description).toBe("edited");
    const rewritten = after.filter(
      (r, i) => r.updatedAt.getTime() !== before[i].updatedAt.getTime(),
    );
    expect(rewritten.map((r) => r.position)).toEqual([7]);
  });

  it("rewrites nothing when the whole section comes back unchanged", async () => {
    const rows = sheet(10);
    await save(rows);
    const before = await stored();
    await new Promise((r) => setTimeout(r, 50));
    await save(rows);
    const after = await stored();
    expect(after.map((r) => r.updatedAt.getTime())).toEqual(
      before.map((r) => r.updatedAt.getTime()),
    );
  });

  it("saves a section bigger than one INSERT batch, whole", async () => {
    const n = FEF_UPSERT_BATCH_ROWS * 2 + 5;
    const saved = await save(sheet(n));
    expect(saved).toHaveLength(n);
    expect(await db.fefRow.count({ where: { versionId } })).toBe(n);
  });

  it("trims positions past the new end when rows are removed", async () => {
    await save(sheet(12));
    await save(sheet(12).slice(0, 5));
    const after = await stored();
    expect(after.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

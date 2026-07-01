import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  resetTestDb,
  disconnectTestPrisma,
} from "~/test/integration-db";
import { allocateEntityNumber, allocateIfBlank } from "./entityNumbers.server";

/**
 * Exercises the real `INSERT … ON CONFLICT DO UPDATE … RETURNING` allocation
 * against Postgres — the behavior the fake-tx unit tests can't cover: actual
 * sequence rows, per-(project, entity) isolation, and (the whole point of the
 * ON CONFLICT design) race-free allocation under concurrency.
 *
 * Skipped unless TEST_DATABASE_URL is set — see docs/integration-testing.md.
 */
describeIntegration("integration: entity number allocation", () => {
  let db: ReturnType<typeof getTestPrisma>;

  beforeAll(() => {
    db = getTestPrisma();
  });
  beforeEach(() => resetTestDb());
  afterAll(() => disconnectTestPrisma());

  /** Create a project and return its id. */
  async function makeProject(displayId: string): Promise<number> {
    const p = await db.project.create({
      data: { displayId, name: `Project ${displayId}`, description: "" },
    });
    return p.id;
  }

  /** Trailing numeric part of a formatted number, e.g. "CVR-007" → 7. */
  const num = (s: string) => Number(s.match(/\d+$/)![0]);

  it("seeds the sequence at 1 on first allocation, then increments", async () => {
    const projectId = await makeProject("P-1");

    expect(await allocateEntityNumber(db, projectId, "ChangeLog")).toBe(
      "CVR-001",
    );
    expect(await allocateEntityNumber(db, projectId, "ChangeLog")).toBe(
      "CVR-002",
    );
    expect(await allocateEntityNumber(db, projectId, "ChangeLog")).toBe(
      "CVR-003",
    );

    const row = await db.numberSequence.findUnique({
      where: {
        projectId_entityType: { projectId, entityType: "ChangeLog" },
      },
    });
    expect(row?.lastValue).toBe(3);
  });

  it("keeps separate sequences per entity type within a project", async () => {
    const projectId = await makeProject("P-1");

    expect(await allocateEntityNumber(db, projectId, "ChangeLog")).toBe(
      "CVR-001",
    );
    expect(await allocateEntityNumber(db, projectId, "Rfi")).toBe("RFI-001");
    expect(await allocateEntityNumber(db, projectId, "ChangeLog")).toBe(
      "CVR-002",
    );
    expect(await allocateEntityNumber(db, projectId, "Trend")).toBe("TR-001");
  });

  it("keeps separate sequences per project for the same entity type", async () => {
    const a = await makeProject("P-A");
    const b = await makeProject("P-B");

    expect(await allocateEntityNumber(db, a, "ChangeLog")).toBe("CVR-001");
    expect(await allocateEntityNumber(db, a, "ChangeLog")).toBe("CVR-002");
    // Project B's series is untouched by A's.
    expect(await allocateEntityNumber(db, b, "ChangeLog")).toBe("CVR-001");
  });

  it("allocateIfBlank keeps a provided number and only allocates when blank", async () => {
    const projectId = await makeProject("P-1");

    // Provided value is kept and the sequence is NOT advanced…
    expect(
      await allocateIfBlank(db, projectId, "ChangeLog", "CVR-099"),
    ).toBe("CVR-099");
    // …so the first real allocation is still 001.
    expect(await allocateIfBlank(db, projectId, "ChangeLog", "")).toBe(
      "CVR-001",
    );
    expect(await allocateIfBlank(db, projectId, "ChangeLog", "   ")).toBe(
      "CVR-002",
    );
  });

  it("allocates a contiguous, gap-free, duplicate-free series under concurrency", async () => {
    const projectId = await makeProject("P-1");
    const N = 25;

    // Fire N allocations at once against the shared pool — the ON CONFLICT
    // increment must serialize them so no two read the same lastValue.
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        allocateEntityNumber(db, projectId, "ChangeLog"),
      ),
    );

    const values = results.map(num).sort((x, y) => x - y);
    expect(new Set(values).size).toBe(N); // no duplicates
    expect(values).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // 1..N, no gaps

    const row = await db.numberSequence.findUnique({
      where: {
        projectId_entityType: { projectId, entityType: "ChangeLog" },
      },
    });
    expect(row?.lastValue).toBe(N);
  });
});

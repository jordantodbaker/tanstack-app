import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  resetTestDb,
  disconnectTestPrisma,
} from "~/test/integration-db";

/**
 * Smoke-level integration test proving the harness end to end: it connects to
 * the real (disposable) Postgres, the schema is present, `resetTestDb` clears
 * state between tests, and a Prisma round-trip returns what was written.
 *
 * Skipped automatically unless TEST_DATABASE_URL is set — see
 * docs/integration-testing.md. Extend this pattern to cover the DB-dependent
 * server logic (auto-numbering, reconciliation queries, cascade deletes, …).
 */
describeIntegration("integration: database harness", () => {
  let db: ReturnType<typeof getTestPrisma>;

  beforeAll(() => {
    db = getTestPrisma();
  });
  beforeEach(() => resetTestDb());
  afterAll(() => disconnectTestPrisma());

  it("round-trips a Project through the real schema", async () => {
    const created = await db.project.create({
      data: {
        displayId: "P-001",
        name: "Test Refinery Expansion",
        description: "Harness smoke test",
      },
    });
    expect(created.id).toBeGreaterThan(0);

    const found = await db.project.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Test Refinery Expansion");
  });

  it("starts each test from a clean slate (reset ran)", async () => {
    // The previous test created a Project; beforeEach truncated it.
    expect(await db.project.count()).toBe(0);
  });
});

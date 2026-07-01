/**
 * Integration-test harness for code that talks to Postgres.
 *
 * Unit tests (the bulk of the suite) run in Node with no database. Integration
 * tests exercise real Prisma queries against a **disposable** Postgres, pointed
 * at by `TEST_DATABASE_URL` (NEVER your dev/prod `DATABASE_URL`). When that env
 * var is unset the whole integration suite is skipped rather than failed, so a
 * plain `npm test` / CI without a database stays green.
 *
 * Usage in a `*.integration.test.ts` file:
 *
 *   import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
 *   import { describeIntegration, getTestPrisma, resetTestDb, disconnectTestPrisma } from "~/test/integration-db";
 *
 *   describeIntegration("…", () => {
 *     let db: ReturnType<typeof getTestPrisma>;
 *     beforeAll(() => { db = getTestPrisma(); });   // NOT at callback top level
 *     beforeEach(() => resetTestDb());
 *     afterAll(() => disconnectTestPrisma());
 *     it("…", async () => { … });
 *   });
 *
 * Prerequisite (once per test DB): push the schema —
 *   TEST_DATABASE_URL=postgres://… npx prisma db push --skip-generate
 * See docs/integration-testing.md.
 */
import { describe } from "vitest";
import { PrismaClient } from "~/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL;

/**
 * `describe` when a test database is configured, `describe.skip` otherwise.
 * Do NOT call `getTestPrisma()` at the top level of the callback — `.skip`
 * still evaluates the callback body to collect the (skipped) tests, so DB
 * access belongs in `beforeAll`/`beforeEach`/`it`, which skipped suites don't run.
 */
export const describeIntegration = url ? describe : describe.skip;

let client: PrismaClient | undefined;

/** Lazily construct a Prisma client bound to `TEST_DATABASE_URL`. */
export function getTestPrisma(): PrismaClient {
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — integration tests should be guarded by describeIntegration",
    );
  }
  if (!client) {
    client = new PrismaClient({
      log: ["warn", "error"],
      adapter: new PrismaPg({ connectionString: url }),
    });
  }
  return client;
}

/**
 * Wipe every application table so each test starts clean. Uses a single
 * `TRUNCATE … RESTART IDENTITY CASCADE`, discovering tables from the catalog so
 * it needs no maintenance as models are added. Skips Prisma's own bookkeeping.
 */
export async function resetTestDb(): Promise<void> {
  const db = getTestPrisma();
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE;`);
}

/** Close the pool at the end of a suite. */
export async function disconnectTestPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

# Integration testing (DB-backed)

Most of the suite is fast, DB-free unit + component tests (`npm test`). A second,
opt-in suite runs real Prisma queries against a **disposable** Postgres to catch
things unit tests can't: schema drift, cascade deletes, unique constraints,
transaction behavior, and the actual SQL our server functions emit.

## TL;DR

```bash
# 1. Point at a THROWAWAY database (never your dev/prod one).
echo 'TEST_DATABASE_URL="postgres://user:pass@host/testdb"' >> .env.test

# 2. Push the current schema into it (once, and after schema changes).
#    prisma reads DATABASE_URL, so set it to the test URL just for this command:
DATABASE_URL="postgres://user:pass@host/testdb" npx prisma db push --skip-generate
#    PowerShell:
#    $env:DATABASE_URL="postgres://…/testdb"; npx prisma db push --skip-generate

# 3. Run the integration suite.
npm run test:integration
```

If `TEST_DATABASE_URL` is not set, the whole integration suite is **skipped**
(via `describeIntegration`), so `npm test` and CI stay green without a database.

## Why a separate database

`resetTestDb()` runs `TRUNCATE … RESTART IDENTITY CASCADE` on every table before
each test. Point `TEST_DATABASE_URL` at anything you care about and it will be
wiped. Use a local Postgres, a Docker container, or a **Neon branch** (cheap and
disposable — branch off, test, delete).

`.env.test` is git-ignored.

## Writing a test

Name the file `*.integration.test.ts` (picked up only by
`vitest.integration.config.ts`, excluded from the default run). Use the harness:

```ts
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  resetTestDb,
  disconnectTestPrisma,
} from "~/test/integration-db";

describeIntegration("CVR auto-numbering", () => {
  let db: ReturnType<typeof getTestPrisma>;
  beforeAll(() => { db = getTestPrisma(); }); // not at the callback top level
  beforeEach(() => resetTestDb());
  afterAll(() => disconnectTestPrisma());

  it("assigns sequential numbers per project", async () => {
    // …seed with db.*, exercise the logic, assert on db.* …
  });
});
```

See `src/server/db.integration.test.ts` for a working smoke test.

## What to cover next

The highest-value DB-backed targets (all currently 0% covered):

- **Auto-numbering** — sequential `NumberSequence` allocation, no gaps/dupes
  under concurrent creates.
- **Budget reconciliation** (`reporting.ts`) — as-bid + approved + pending +
  trend rollups against seeded CVRs/snapshots.
- **Cascade + referential integrity** — deleting a project/area, promoting an
  FCO to a CVR, orphan cleanup.

> Note: these live inside `createServerFn` handlers. Test the underlying query
> logic against `getTestPrisma()`, or extract handler bodies into plain async
> functions that take a Prisma client so they can be called directly.

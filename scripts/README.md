# Maintenance scripts

One-off and recurring jobs that run against a database directly, outside the
app. Every one takes its connection from `DATABASE_URL`, so **set it explicitly
when you mean a database other than the one in `.env`**:

```powershell
$env:DATABASE_URL="<url>"; npm run <script>
```

Anything destructive supports `-- --dry-run`. Run that first.

## CBS maintenance

The CBS is maintained in `prisma/data/CBS.xlsx` and flows into the
`CbsItem` table. These three run **in this order** after a new workbook lands;
the full sequence, and the hard-coded code tables a renumbering invalidates,
are documented in [DEPLOYMENT.md §11a](../docs/DEPLOYMENT.md).

| Script | npm | What it does |
|---|---|---|
| `import-cbs.ts` | `cbs:import` | Re-imports the workbook into `CbsItem`, expanding the generated S/M rows. Upserts by cost code, so row ids and every project's allow-list survive. New codes are **not** granted to any project. |
| `sync-piping-group-codes.ts` | `piping:sync-codes` | Pushes the piping metallurgy codes from `piping_groups.csv` into `PipingGroup`. Not derived from the workbook, so a renumbered piping series leaves these stale and piping rows stop auto-populating. |
| `rename-cbs-accounts.ts` | `cbs:rename` | Re-applies account renames the workbook does not carry yet. The import takes names straight from the workbook, so a name edited only in the database is reverted; each entry records the workbook cell the same edit belongs in. |

After all three: re-grant any new codes on the Setup page, and smoke-test one
take-off page per discipline.

## Data migrations

| Script | What it does |
|---|---|
| `migrate-grout-discipline.ts` | One-off for adding the Grout discipline: appends it to every role, migrates EVM measurement buckets from CBS digit to discipline id, recomputes snapshot totals. Idempotent. |
| `backfill-role-disciplines.ts` | Backfills `Role.disciplines` for roles created before the field existed. |

`prisma/backfill-number-sequences.ts` (`npm run backfill-numbers`) belongs to
this group too — seed each project's auto-number sequence from the highest
existing record number. Only needed on a restored or migrated database.

## Checks

| Script | npm | What it does |
|---|---|---|
| `check-client-leak.ts` | `check:client-leak` | Fails if a client-reachable module pulls in Prisma. Run in CI alongside the tests. |
| `verify-trigram-indexes.ts` | — | Confirms the `pg_trgm` indexes the search paths depend on exist. Run after provisioning a new database. |

## Test data

| Script | npm | What it does |
|---|---|---|
| `seed-test-estimate.ts` | — | Adds a sample estimate to an existing project. |
| `prisma/seed-test.ts` | `seed-test` | Full demo dataset. Wipes and reseeds; **never** point it at production. |

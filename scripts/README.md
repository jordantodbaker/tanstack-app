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
| `import-cbs.ts` | `cbs:import` | Re-imports the workbook into `CbsItem`. Normalises summary codes to the `-0` backbone, strips the cost-type suffix from names, and generates any S/M twin the sheet is missing. Upserts by cost code, so row ids and every project's allow-list survive. New codes are **not** granted to any project. |
| `sync-piping-group-codes.ts` | `piping:sync-codes` | Pushes the piping metallurgy codes from `piping_groups.csv` into `PipingGroup`. Not derived from the workbook, so a renumbered piping series leaves these stale and piping rows stop auto-populating. |
| `rename-cbs-accounts.ts` | `cbs:rename` | Applies account renames. A rename has two halves: the database half (`cbs:rename`) shows the new name now, and the workbook half (`cbs:rename -- --workbook`) writes the Name cell so the next import carries it instead of reverting it. The cell is resolved against the workbook at run time, so the reference cannot go stale. `--workbook` is opt-in because CBS.xlsx is the master file — close it in Excel first, or the write fails with `EBUSY`. |

After all three: re-grant any new codes on the Setup page, and smoke-test one
take-off page per discipline.

## Data migrations

| Script | What it does |
|---|---|
| `migrate-grout-discipline.ts` | One-off for adding the Grout discipline: appends it to every role, migrates EVM measurement buckets from CBS digit to discipline id, recomputes snapshot totals. Idempotent. |
| `backfill-role-disciplines.ts` | Keeps `Role.disciplines` in step with `src/config/disciplines.ts`: fills roles whose list is empty, and adds any discipline **no** role references yet — what a newly added discipline looks like from the database's side, and otherwise missing from every take-off Role dropdown. A discipline some roles have and others don't is deliberate scoping and is left alone. Idempotent; supports `--dry-run`. Run it after adding a discipline. |
| `relink-clerk-ids.ts` | Re-points `User.clerkId` at the live Clerk account when the stored id no longer resolves — what happens when a Clerk account is deleted and re-created, or when the app moves Clerk instances. Those rows keep the role and project grants, but `email` is unique, so the app cannot replace them either and the user resolves to nothing: no role, no projects. `resolveCurrentUser` now re-links on sign-in, so this is for repairing rows ahead of a deploy. Writes only with `--apply`; needs `DATABASE_URL` and `CLERK_SECRET_KEY` to be the pair that actually run together. |

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

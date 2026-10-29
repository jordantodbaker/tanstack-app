# Maintenance scripts

One-off and recurring jobs that run against a database directly, outside the
app. Every one takes its connection from `DATABASE_URL`, so **set it explicitly
when you mean a database other than the one in `.env`**:

```powershell
$env:DATABASE_URL="<url>"; npm run <script>
```

Anything destructive supports `-- --dry-run`. Run that first.

## CBS maintenance

The CBS is maintained condensed in `prisma/data/CBS.master.xlsx`: one row per
account, four-segment codes, and a YES/NO flag per cost type. `cbs:expand`
generates the expanded `prisma/data/CBS.xlsx` from it, and that is what flows
into the `CbsItem` table. These run **in this order** after a new master lands;
the full sequence, and the hard-coded code tables a renumbering invalidates,
are documented in [DEPLOYMENT.md §11a](../docs/DEPLOYMENT.md).

| Script                       | npm                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expand-cbs-workbook.ts`     | `cbs:expand`        | Expands the condensed master into `CBS.xlsx`: a `-0` roll-up row per account (name `(*)`, "Roll-up code for …") plus one typed row per YES flag (`-L` 5000, `-S` 5200 DIRECT SUBCONTRACT, `-M` 5100 MATERIALS, `-E` 5300 DIRECT EQUIPMENT, `-O` 5400, `-R` 5500), each with its own code, name marker, description, Row Type and Original Row. A Material Type of Both becomes a Bulk and a Tagged material row (they share a code; the loader keeps the first). Rules in `src/lib/cbs-workbook-expand.ts`. Refuses an already-expanded input, so pointing it at its own output is harmless; `-- --dry-run` prints the plan. The output is regenerated whole, so fix the **master**, never `CBS.xlsx`. Run it **first**, and commit both files. |
| `import-cbs.ts`              | `cbs:import`        | Re-imports the expanded workbook into `CbsItem`, one item per sheet row — nothing is generated here; `cbs:expand` owns every cost type. Normalizes summary codes to the `-0` backbone. Upserts by cost code, so row ids and every project's allow-list survive. New codes are **not** granted to any project. `-- --workbook <path>` reads another expanded file, for when `CBS.xlsx` is locked open in Excel and `cbs:expand -- --out` had to write elsewhere.                                                                                                                                                                                                                                                                                 |
| `sync-piping-group-codes.ts` | `piping:sync-codes` | Pushes the piping metallurgy codes from `piping_groups.csv` into `PipingGroup`. Not derived from the workbook, so a renumbered piping series leaves these stale and piping rows stop auto-populating.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `rename-cbs-accounts.ts`     | `cbs:rename`        | Applies account renames. A rename has two halves: the database half (`cbs:rename`) shows the new name now, and the workbook half (`cbs:rename -- --workbook`) writes the Name cell of the account's row in `CBS.master.xlsx`, so the next `cbs:expand` and import carry it instead of reverting it. The cell is resolved against the master at run time, so the reference cannot go stale. `--workbook` is opt-in because the master is usually open in Excel — close it first, or the write fails with `EBUSY`.                                                                                                                                                                                                                                |

After all of them: re-grant any new codes on the Setup page, and smoke-test one
take-off page per discipline.

`cbs:repair` is gone (2026-10-29). The defects it fixed arrived with
upstream-expanded workbooks; the master is condensed now, and `cbs:expand`
validates it and generates every code itself.

## Data migrations

| Script                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate-grout-discipline.ts`  | One-off for adding the Grout discipline: appends it to every role, migrates EVM measurement buckets from CBS digit to discipline id, recomputes snapshot totals. Idempotent.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `backfill-role-disciplines.ts` | Keeps `Role.disciplines` in step with `src/config/disciplines.ts`: fills roles whose list is empty, and adds any discipline **no** role references yet — what a newly added discipline looks like from the database's side, and otherwise missing from every take-off Role dropdown. A discipline some roles have and others don't is deliberate scoping and is left alone. Idempotent; supports `--dry-run`. Run it after adding a discipline.                                                                                                                                    |
| `relink-clerk-ids.ts`          | Re-points `User.clerkId` at the live Clerk account when the stored id no longer resolves — what happens when a Clerk account is deleted and re-created, or when the app moves Clerk instances. Those rows keep the role and project grants, but `email` is unique, so the app cannot replace them either and the user resolves to nothing: no role, no projects. `resolveCurrentUser` now re-links on sign-in, so this is for repairing rows ahead of a deploy. Writes only with `--apply`; needs `DATABASE_URL` and `CLERK_SECRET_KEY` to be the pair that actually run together. |

`prisma/backfill-number-sequences.ts` (`npm run backfill-numbers`) belongs to
this group too — seed each project's auto-number sequence from the highest
existing record number. Only needed on a restored or migrated database.

## Checks

| Script                      | npm                 | What it does                                                                                            |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `check-client-leak.ts`      | `check:client-leak` | Fails if a client-reachable module pulls in Prisma. Run in CI alongside the tests.                      |
| `verify-trigram-indexes.ts` | —                   | Confirms the `pg_trgm` indexes the search paths depend on exist. Run after provisioning a new database. |

## Test data

| Script                  | npm         | What it does                                                            |
| ----------------------- | ----------- | ----------------------------------------------------------------------- |
| `seed-test-estimate.ts` | —           | Adds a sample estimate to an existing project.                          |
| `prisma/seed-test.ts`   | `seed-test` | Full demo dataset. Wipes and reseeds; **never** point it at production. |

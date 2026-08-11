// One-time (idempotent) backfill for the estimate-versioning feature. It moves
// every project from the old "one estimate keyed by projectId" model to the new
// "estimate versions" model by creating a default "v1" per project and pointing
// that project's existing FefRow + BasisInputs rows at it.
//
// WHY A SCRIPT (not just `prisma db push`): `db push` can't add a REQUIRED FK
// column to a populated table in one step — the NOT NULL would reject existing
// rows. So this script uses raw SQL to (1) create the EstimateVersion table and
// add the versionId columns as NULLABLE, then (2) populate them. Afterward a
// final `prisma db push` reconciles the rest (FK constraints, NOT NULL, and the
// swap of FefRow's unique/index from projectId to versionId).
//
//   RUNBOOK (against each database — dev/branch first):
//     1. tsx prisma/backfill-estimate-versions.ts --dry-run   # preview
//     2. tsx prisma/backfill-estimate-versions.ts             # create + assign
//     3. npx prisma db push --accept-data-loss                # finalize; the
//        only "data loss" is dropping BasisInputs.projectId, now redundant
//     4. npx prisma generate
//
// Safe to re-run: the DDL uses IF NOT EXISTS, version creation is guarded by a
// NOT EXISTS check, the NumberSequence seed is ON CONFLICT DO NOTHING, and the
// row updates only touch rows whose versionId is still NULL.
//
// Uses raw SQL throughout on purpose: the generated Prisma client already
// reflects the FINAL schema (versionId required, no BasisInputs.projectId),
// which doesn't match the database during this transitional step.
import "dotenv/config";

import { prisma } from "../src/server/db";

const DRY_RUN = process.argv.includes("--dry-run");

// Matches how Prisma generates the table so the follow-up `db push` sees no
// structural drift and only needs to add FKs / NOT NULL / swap constraints.
const DDL = [
  `CREATE TABLE IF NOT EXISTS "EstimateVersion" (
     "id" SERIAL NOT NULL,
     "projectId" INTEGER NOT NULL,
     "versionNumber" INTEGER NOT NULL,
     "name" TEXT NOT NULL DEFAULT '',
     "description" TEXT NOT NULL DEFAULT '',
     "parentVersionId" INTEGER,
     "createdById" INTEGER,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EstimateVersion_projectId_versionNumber_key"
     ON "EstimateVersion"("projectId", "versionNumber")`,
  `CREATE INDEX IF NOT EXISTS "EstimateVersion_projectId_idx"
     ON "EstimateVersion"("projectId")`,
  `ALTER TABLE "FefRow" ADD COLUMN IF NOT EXISTS "versionId" INTEGER`,
  `ALTER TABLE "BasisInputs" ADD COLUMN IF NOT EXISTS "versionId" INTEGER`,
  `ALTER TABLE "EstimateSnapshot" ADD COLUMN IF NOT EXISTS "versionId" INTEGER`,
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) AS exists`,
    table,
    column,
  );
  return rows[0]?.exists ?? false;
}

async function main(): Promise<void> {
  console.log(
    DRY_RUN
      ? "Backfilling estimate versions (DRY RUN — no writes)…"
      : "Backfilling estimate versions…",
  );

  if (!DRY_RUN) {
    for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    console.log("  Schema prepared (table + nullable versionId columns).");
  } else {
    console.log("  [dry run] would create EstimateVersion + versionId columns.");
  }

  const projects = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT id FROM "Project" ORDER BY id`,
  );

  // In a dry run the versionId column may not exist yet (DDL is skipped), so
  // "unassigned" is every FefRow for the project. Once the column exists we can
  // count only the still-null ones (so a re-run reports what's left to do).
  const hasVersionCol = await columnExists("FefRow", "versionId");
  const unassignedCountSql = hasVersionCol
    ? `SELECT COUNT(*)::bigint AS count FROM "FefRow"
       WHERE "projectId" = $1 AND "versionId" IS NULL`
    : `SELECT COUNT(*)::bigint AS count FROM "FefRow" WHERE "projectId" = $1`;

  let created = 0;
  let fefAssigned = 0;
  let basisAssigned = 0;

  for (const { id: projectId } of projects) {
    // How many rows this project would move (reported in both modes).
    const [{ count: fefNull }] = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(unassignedCountSql, projectId);

    if (DRY_RUN) {
      console.log(
        `  project ${projectId}: would create v1 and assign ${fefNull} FefRow(s) + its BasisInputs`,
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "EstimateVersion" ("projectId","versionNumber","name","description","createdAt","updatedAt")
         SELECT $1, 1, '', '', NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM "EstimateVersion" WHERE "projectId" = $1)`,
        projectId,
      );
      const [version] = await tx.$queryRawUnsafe<{ id: number }[]>(
        `SELECT id FROM "EstimateVersion" WHERE "projectId" = $1
         ORDER BY "versionNumber" ASC LIMIT 1`,
        projectId,
      );
      // Seed the per-project version counter so the next created version is v2.
      await tx.$executeRawUnsafe(
        `INSERT INTO "NumberSequence" ("projectId","entityType","prefix","padWidth","lastValue","updatedAt")
         VALUES ($1, 'EstimateVersion', 'v', 1, 1, NOW())
         ON CONFLICT ("projectId","entityType") DO NOTHING`,
        projectId,
      );
      const fefRes = await tx.$executeRawUnsafe(
        `UPDATE "FefRow" SET "versionId" = $2
         WHERE "projectId" = $1 AND "versionId" IS NULL`,
        projectId,
        version.id,
      );
      const basisRes = await tx.$executeRawUnsafe(
        `UPDATE "BasisInputs" SET "versionId" = $2
         WHERE "projectId" = $1 AND "versionId" IS NULL`,
        projectId,
        version.id,
      );
      created += 1;
      fefAssigned += fefRes;
      basisAssigned += basisRes;
      console.log(
        `  project ${projectId}: v1 = version ${version.id}; assigned ${fefRes} FefRow(s), ${basisRes} BasisInputs`,
      );
    });
  }

  if (DRY_RUN) {
    console.log("Dry run complete.");
    return;
  }
  console.log(
    `Backfill complete: ${created} project(s) ensured, ${fefAssigned} FefRow(s) and ${basisAssigned} BasisInputs assigned.`,
  );
  console.log(
    "Next: `npx prisma db push --accept-data-loss` then `npx prisma generate`.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

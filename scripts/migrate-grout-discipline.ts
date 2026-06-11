// One-off data migration for adding the Grout discipline. Idempotent — safe to
// re-run. Three independent steps:
//   1. Roles  — append "grout" to every Role.disciplines (so grout's take-off
//      Role dropdown is populated, matching the seed's "all roles everywhere").
//   2. EVM measurement buckets — the EVM bucket key changed from a single CBS
//      digit ("0".."9") to a discipline id; migrate existing PeriodMeasurement
//      rows (e.g. "2" → "concrete", "6" → "piping").
//   3. Snapshot totals — recompute cached snapshot `totals` so they carry the
//      `byL1` buckets the new discipline aggregation needs (avoids a per-read
//      recompute for snapshots created before `byL1` existed).
//
// Run:  npx tsx scripts/migrate-grout-discipline.ts
import "dotenv/config";
import { prisma } from "../src/server/db";
import {
  accumulateProjectTotals,
  type ProjectTotalsRow,
} from "../src/lib/project-totals";

// Digit → discipline id for the EVM bucket migration. Matches the canonical
// discipline per digit; the project has only buckets {1,6,7} today.
const DIGIT_TO_DISCIPLINE: Record<string, string> = {
  "0": "procurement",
  "1": "civil",
  "2": "concrete",
  "3": "steel",
  "4": "buildings",
  "5": "equipment",
  "6": "piping",
  "7": "electric",
  "8": "instruments",
  "9": "coatings",
};

async function migrateRoles() {
  const roles = await prisma.role.findMany({
    select: { id: true, name: true, disciplines: true },
  });
  let updated = 0;
  for (const r of roles) {
    if (r.disciplines.includes("grout")) continue;
    await prisma.role.update({
      where: { id: r.id },
      data: { disciplines: [...r.disciplines, "grout"] },
    });
    updated++;
  }
  console.log(`[roles] added "grout" to ${updated}/${roles.length} roles.`);
}

async function migrateMeasurementBuckets() {
  const measurements = await prisma.periodMeasurement.findMany({
    select: { id: true, periodId: true, bucket: true },
  });
  let migrated = 0;
  let skipped = 0;
  for (const m of measurements) {
    // Already a discipline id (re-run) — leave it.
    if (!/^[0-9]$/.test(m.bucket)) {
      skipped++;
      continue;
    }
    const disc = DIGIT_TO_DISCIPLINE[m.bucket];
    if (!disc) {
      skipped++;
      continue;
    }
    // Guard the unique([periodId,bucket]) — if a row for the target discipline
    // already exists in this period, drop the digit row rather than collide.
    const clash = await prisma.periodMeasurement.findUnique({
      where: { periodId_bucket: { periodId: m.periodId, bucket: disc } },
      select: { id: true },
    });
    if (clash && clash.id !== m.id) {
      await prisma.periodMeasurement.delete({ where: { id: m.id } });
      console.log(
        `[measurements] period ${m.periodId}: "${m.bucket}" dropped (target "${disc}" already exists).`,
      );
      migrated++;
      continue;
    }
    await prisma.periodMeasurement.update({
      where: { id: m.id },
      data: { bucket: disc },
    });
    migrated++;
  }
  console.log(
    `[measurements] migrated ${migrated} digit→discipline, skipped ${skipped}.`,
  );
}

async function backfillSnapshotTotals() {
  const snaps = await prisma.estimateSnapshot.findMany({
    select: { id: true, label: true, fefRows: true, totals: true },
  });
  let backfilled = 0;
  for (const s of snaps) {
    const totals = s.totals as Record<string, unknown> | null;
    if (totals && "laborByL1" in totals) continue; // already current
    const rows = (s.fefRows as unknown as ProjectTotalsRow[]) ?? [];
    const recomputed = accumulateProjectTotals(rows);
    await prisma.estimateSnapshot.update({
      where: { id: s.id },
      data: { totals: recomputed as unknown as object },
    });
    backfilled++;
  }
  console.log(
    `[snapshots] backfilled byL1 totals on ${backfilled}/${snaps.length} snapshots.`,
  );
}

async function main() {
  await migrateRoles();
  await migrateMeasurementBuckets();
  await backfillSnapshotTotals();
  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

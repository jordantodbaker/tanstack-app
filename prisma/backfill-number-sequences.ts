// One-time (idempotent) backfill for the per-project record-number sequences
// introduced with auto-numbering. For every project + entity type it finds the
// highest EXISTING number that matches the sequence's prefix + digits format
// (e.g. "CVR-0007" → 7) and seeds `NumberSequence.lastValue` to it, so the
// first auto-assigned number continues from there instead of colliding with a
// hand-entered "CVR-0001".
//
//   Preview:  tsx prisma/backfill-number-sequences.ts --dry-run
//   Apply:    tsx prisma/backfill-number-sequences.ts
//
// Safe to re-run: each sequence is set to GREATEST(existing lastValue, highest
// parsed number), so it never moves a counter backward. Records whose number
// doesn't match the prefix+digits format (custom schemes, blanks, the old
// "CVR-from-FCO-3" promotion strings) are ignored and counted in the summary —
// those projects simply start their sequence at 1.
import "dotenv/config";

import { prisma } from "../src/server/db";
import {
  NUMBER_DEFAULTS,
  type NumberedEntityType,
} from "../src/utils/entityNumbers.server";

const DRY_RUN = process.argv.includes("--dry-run");

/** Pull `{ projectId, number }` for every row of one entity. Each entity has a
 *  differently-named number column, so the fetches are explicit (and typed)
 *  rather than dynamically keyed. */
async function fetchNumbers(
  entityType: NumberedEntityType,
): Promise<{ projectId: number; number: string }[]> {
  switch (entityType) {
    case "ChangeLog": {
      const rows = await prisma.changeLog.findMany({
        select: { projectId: true, cvrNumber: true },
      });
      return rows.map((r) => ({ projectId: r.projectId, number: r.cvrNumber }));
    }
    case "FieldChangeOrder": {
      const rows = await prisma.fieldChangeOrder.findMany({
        select: { projectId: true, fcoNumber: true },
      });
      return rows.map((r) => ({ projectId: r.projectId, number: r.fcoNumber }));
    }
    case "Rfi": {
      const rows = await prisma.rfi.findMany({
        select: { projectId: true, rfiNumber: true },
      });
      return rows.map((r) => ({ projectId: r.projectId, number: r.rfiNumber }));
    }
    case "Pco": {
      const rows = await prisma.pco.findMany({
        select: { projectId: true, pcoNumber: true },
      });
      return rows.map((r) => ({ projectId: r.projectId, number: r.pcoNumber }));
    }
    case "Trend": {
      const rows = await prisma.trend.findMany({
        select: { projectId: true, trendNumber: true },
      });
      return rows.map((r) => ({
        projectId: r.projectId,
        number: r.trendNumber,
      }));
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function backfillEntity(entityType: NumberedEntityType): Promise<void> {
  const def = NUMBER_DEFAULTS[entityType];
  // Respect a prefix/padWidth an admin may already have customized on an
  // existing sequence row; fall back to the code defaults otherwise.
  const existing = await prisma.numberSequence.findMany({
    where: { entityType },
  });
  const existingByProject = new Map(existing.map((s) => [s.projectId, s]));

  const rows = await fetchNumbers(entityType);

  // Per project: highest parsed number, and how many rows didn't match.
  const maxByProject = new Map<number, number>();
  const skippedByProject = new Map<number, number>();
  for (const { projectId, number } of rows) {
    const prefix = existingByProject.get(projectId)?.prefix ?? def.prefix;
    const re = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
    const m = re.exec(number.trim());
    if (!m) {
      skippedByProject.set(projectId, (skippedByProject.get(projectId) ?? 0) + 1);
      continue;
    }
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n)) continue;
    maxByProject.set(projectId, Math.max(maxByProject.get(projectId) ?? 0, n));
  }

  const projectIds = new Set<number>([
    ...maxByProject.keys(),
    ...skippedByProject.keys(),
  ]);
  if (projectIds.size === 0) {
    console.log(`  ${entityType}: no records — nothing to seed.`);
    return;
  }

  for (const projectId of [...projectIds].sort((a, b) => a - b)) {
    const parsedMax = maxByProject.get(projectId) ?? 0;
    const current = existingByProject.get(projectId);
    const seedValue = Math.max(parsedMax, current?.lastValue ?? 0);
    const skipped = skippedByProject.get(projectId) ?? 0;
    const skipNote = skipped > 0 ? ` (${skipped} unmatched, ignored)` : "";

    if (current && current.lastValue >= seedValue) {
      console.log(
        `  ${entityType} project ${projectId}: lastValue already ${current.lastValue} ≥ ${seedValue} — left as-is${skipNote}`,
      );
      continue;
    }

    const next = `${def.prefix}${String(seedValue + 1).padStart(def.padWidth, "0")}`;
    console.log(
      `  ${entityType} project ${projectId}: lastValue → ${seedValue} (next: ${next})${skipNote}`,
    );

    if (DRY_RUN) continue;

    await prisma.numberSequence.upsert({
      where: { projectId_entityType: { projectId, entityType } },
      create: {
        projectId,
        entityType,
        prefix: def.prefix,
        padWidth: def.padWidth,
        lastValue: seedValue,
      },
      update: { lastValue: seedValue },
    });
  }
}

async function main(): Promise<void> {
  console.log(
    DRY_RUN
      ? "Backfilling number sequences (DRY RUN — no writes)…"
      : "Backfilling number sequences…",
  );
  const entityTypes = Object.keys(NUMBER_DEFAULTS) as NumberedEntityType[];
  for (const entityType of entityTypes) {
    await backfillEntity(entityType);
  }
  console.log(DRY_RUN ? "Dry run complete." : "Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

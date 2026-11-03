import { prisma } from "../server/db";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
  type ProjectTotalsRow,
} from "~/lib/project-totals";

/**
 * SERVER-ONLY. A snapshot's totals, from its cache.
 *
 * Every snapshot made since the `totals` column exists carries the
 * aggregator's output, L1 buckets included, so the readers never touch the
 * frozen `fefRows` blob. Snapshots from before then have no cache, or one
 * without the per-L1 buckets, and are recomputed from the blob here — in
 * one place, where four readers used to carry their own copy, two of them
 * checking for `totals !== null` and two for the L1 buckets.
 *
 * The recompute is a compatibility path, not a feature: `npm run
 * snapshots:backfill` writes the cache onto every old snapshot, after which
 * nothing reaches it and `totals` can be made NOT NULL and this fallback
 * deleted. Until that has been run on every database, it stays.
 */

/** A cached total the readers can use: it carries the L1 buckets. */
export function hasCurrentTotals(
  totals: unknown,
): totals is ProjectFefRowTotals {
  return (
    totals !== null &&
    typeof totals === "object" &&
    "laborByL1" in (totals as Record<string, unknown>)
  );
}

/**
 * The totals for each snapshot given, cached where current, recomputed from
 * the frozen rows otherwise — one query for every recompute, not one each.
 */
export async function snapshotTotalsById(
  snapshots: readonly { id: number; totals: unknown }[],
): Promise<Map<number, ProjectFefRowTotals>> {
  const out = new Map<number, ProjectFefRowTotals>();
  const stale = new Set<number>();
  for (const s of snapshots) {
    // A snapshot behind several periods is read once.
    if (out.has(s.id) || stale.has(s.id)) continue;
    if (hasCurrentTotals(s.totals)) out.set(s.id, s.totals);
    else stale.add(s.id);
  }
  if (stale.size > 0) {
    const rows = await prisma.estimateSnapshot.findMany({
      where: { id: { in: [...stale] } },
      select: { id: true, fefRows: true },
    });
    for (const s of rows) {
      out.set(
        s.id,
        accumulateProjectTotals(
          (s.fefRows as unknown as ProjectTotalsRow[]) ?? [],
        ),
      );
    }
  }
  return out;
}

/** `snapshotTotalsById` for one snapshot. */
export async function snapshotTotals(snapshot: {
  id: number;
  totals: unknown;
}): Promise<ProjectFefRowTotals> {
  if (hasCurrentTotals(snapshot.totals)) return snapshot.totals;
  const byId = await snapshotTotalsById([snapshot]);
  return byId.get(snapshot.id) ?? accumulateProjectTotals([]);
}

/**
 * Write the current cache onto every snapshot that lacks it. Idempotent: a
 * snapshot whose cache already carries the L1 buckets is left alone, so it
 * can run on every deploy until the fallback above is retired.
 */
export async function backfillSnapshotTotals(): Promise<{
  total: number;
  backfilled: number;
}> {
  const snaps = await prisma.estimateSnapshot.findMany({
    select: { id: true, fefRows: true, totals: true },
  });
  let backfilled = 0;
  for (const s of snaps) {
    if (hasCurrentTotals(s.totals)) continue;
    const recomputed = accumulateProjectTotals(
      (s.fefRows as unknown as ProjectTotalsRow[]) ?? [],
    );
    await prisma.estimateSnapshot.update({
      where: { id: s.id },
      data: { totals: recomputed as unknown as object },
    });
    backfilled++;
  }
  return { total: snaps.length, backfilled };
}

// Writes the cached `totals` onto every EstimateSnapshot that lacks the current
// shape (no cache, or one from before the per-L1 buckets). Idempotent — a
// snapshot already carrying the L1 buckets is left alone — so it is safe to
// run on every deploy.
//
// Why: the EVM readers and the snapshot detail dialog carry a recompute-from-
// `fefRows` fallback for such snapshots (`src/utils/snapshot-totals.server.ts`).
// Once this has run on every database, nothing reaches that fallback, `totals`
// can be made NOT NULL in schema.prisma, and the fallback deleted.
//
// Run:  DATABASE_URL=<env-url> npm run snapshots:backfill
import "dotenv/config";
import { prisma } from "../src/server/db";
import { backfillSnapshotTotals } from "../src/utils/snapshot-totals.server";

async function main() {
  const { backfilled, total } = await backfillSnapshotTotals();
  console.log(
    `[snapshots] backfilled totals on ${backfilled} of ${total} snapshots` +
      (backfilled === 0
        ? " — every snapshot already carries the current cache."
        : "."),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

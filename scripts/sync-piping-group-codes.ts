// Re-syncs `PipingGroup.installCode` / `shopCode` from
// `prisma/data/piping_groups.csv` into an existing database.
//
// These two columns are the metallurgy codes the Piping take-off composes CBS
// cost codes from (see `pipingCostCodes` in src/lib/piping-derive.ts). The
// The CBS renumbered the piping series — shop fabrication 603–613 → 610–620,
// field install 633–643 → 640–650 — so a database seeded before that update
// still holds codes that no longer resolve to anything, and piping rows stop
// auto-populating their CBS id/name.
//
// The full seed (`prisma db seed`) would fix this too, but it wipes projects
// first. This touches nothing but the two code columns, matched on
// `materialClassification`, and is idempotent.
//
// Run:  npx tsx scripts/sync-piping-group-codes.ts [--dry-run]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prisma } from "../src/server/db";
import {
  parsePipingGroupCodes,
  planPipingGroupSync,
} from "../src/lib/piping-group-sync";

const dryRun = process.argv.includes("--dry-run");
const CSV = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "data",
  "piping_groups.csv",
);

async function main() {
  const wanted = parsePipingGroupCodes(readFileSync(CSV, "utf-8"));
  console.log(`CSV: ${wanted.size} material classification(s)`);

  const groups = await prisma.pipingGroup.findMany({
    select: {
      id: true,
      materialClassification: true,
      installCode: true,
      shopCode: true,
    },
  });

  // Which rows are stale — see src/lib/piping-group-sync.ts, kept pure so the
  // matching rules are unit-tested without a database.
  const { stale, current, unknown, changes } = planPipingGroupSync(wanted, groups);

  console.log(
    `DB: ${groups.length} group(s) → ${stale.length} to update, ${current} already current` +
      (unknown.length ? `, ${unknown.length} not in the CSV` : ""),
  );
  for (const c of unknown) console.log(`  not in CSV: "${c}"`);
  for (const c of changes) console.log(`  ${c.description}  ${c.classification}`);

  if (stale.length === 0) {
    console.log("\nNothing to do.");
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: no changes written.");
    return;
  }

  for (let i = 0; i < stale.length; i += 10) {
    await Promise.all(
      stale.slice(i, i + 10).map((s) =>
        prisma.pipingGroup.update({
          where: { id: s.id },
          data: { installCode: s.installCode, shopCode: s.shopCode },
        }),
      ),
    );
  }
  console.log(`\nUpdated ${stale.length} piping group(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

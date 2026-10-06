// Re-syncs `PipingGroup.installCode` / `shopCode` from
// `prisma/data/piping_groups.csv` into an existing database.
//
// These two columns are the metallurgy codes the Piping take-off composes CBS
// cost codes from (see `pipingCostCodes` in src/lib/piping-derive.ts). The
// Master CBS renumbered the piping series — shop fabrication 603–613 → 610–620,
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

const dryRun = process.argv.includes("--dry-run");
const CSV = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "data",
  "piping_groups.csv",
);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuote = false;
      } else field += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

/** classification → { installCode, shopCode }, first row wins. */
function loadCodes(): Map<string, { installCode: string; shopCode: string }> {
  const lines = readFileSync(CSV, "utf-8").split(/\r?\n/);
  const map = new Map<string, { installCode: string; shopCode: string }>();
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const cols = parseCsvLine(line);
    const classification = (cols[1] ?? "").trim();
    const installCode = (cols[2] ?? "").trim();
    const shopCode = (cols[3] ?? "").trim();
    if (!classification || !installCode || !shopCode) continue;
    if (!map.has(classification)) map.set(classification, { installCode, shopCode });
  }
  return map;
}

async function main() {
  const wanted = loadCodes();
  console.log(`CSV: ${wanted.size} material classification(s)`);

  const groups = await prisma.pipingGroup.findMany({
    select: {
      id: true,
      materialClassification: true,
      installCode: true,
      shopCode: true,
    },
  });

  const stale: { id: number; installCode: string; shopCode: string }[] = [];
  const unknown = new Set<string>();
  let current = 0;
  for (const g of groups) {
    const want = wanted.get(g.materialClassification);
    if (!want) {
      unknown.add(g.materialClassification);
      continue;
    }
    if (g.installCode === want.installCode && g.shopCode === want.shopCode) {
      current++;
      continue;
    }
    stale.push({ id: g.id, ...want });
  }

  console.log(
    `DB: ${groups.length} group(s) → ${stale.length} to update, ${current} already current` +
      (unknown.size ? `, ${unknown.size} not in the CSV` : ""),
  );
  for (const c of unknown) console.log(`  not in CSV: "${c}"`);

  // Show what changes, grouped by classification rather than per group row.
  const byClass = new Map<string, string>();
  for (const g of groups) {
    const want = wanted.get(g.materialClassification);
    if (!want) continue;
    if (g.installCode === want.installCode && g.shopCode === want.shopCode) continue;
    byClass.set(
      g.materialClassification,
      `${g.installCode}/${g.shopCode} → ${want.installCode}/${want.shopCode}`,
    );
  }
  for (const [cls, change] of byClass) console.log(`  ${change}  ${cls}`);

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

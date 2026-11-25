// Loads prisma/data/LegacyCBS.xlsx into `CbsLegacyItem`, replacing what is
// there. Nothing references these rows, so a full swap in one transaction is
// simplest and never leaves a half-loaded list. `cbs:import` does not touch
// this table, and this does not touch `CbsItem`.
//
// Run:  npm run cbs:import-legacy [-- --dry-run]
import "dotenv/config";
import { prisma } from "../src/server/db";
import { loadCbsLegacyWorkbook } from "../prisma/cbs-legacy-workbook";

async function main() {
  const items = await loadCbsLegacyWorkbook();
  if (items.length === 0) throw new Error("No legacy rows found.");
  const notRetired = items.filter((i) => i.status !== "Retired").length;
  const repeated = items.length - new Set(items.map((i) => i.code)).size;
  console.log(
    `Legacy rows: ${items.length} (${repeated} repeat an earlier code, ${notRetired} not Retired)`,
  );
  if (process.argv.includes("--dry-run")) {
    console.log("--dry-run: no changes written.");
    return;
  }
  const [del, made] = await prisma.$transaction([
    prisma.cbsLegacyItem.deleteMany(),
    prisma.cbsLegacyItem.createMany({ data: items }),
  ]);
  console.log(`Replaced ${del.count} legacy rows with ${made.count}.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

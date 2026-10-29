// Expands the condensed CBS master into the workbook the import reads.
//
// The CBS is now maintained condensed: one row per account, four-segment
// codes (012-05-1000-00), and a YES/NO flag per cost type (Labor / Sub /
// Material / Equipment / Other / Rental). The loader, the CBS Health report
// and `cbs:import` all expect the expanded dictionary the sheet used to ship
// as: a "-0" roll-up row per account plus one typed row per YES flag, each
// with its own code, G/L, name marker and description. This script produces
// that file. The rules live in `src/lib/cbs-workbook-expand.ts`; the Excel
// around them in `prisma/cbs-expand.ts`.
//
//   npm run cbs:expand                 read CBS.master.xlsx, write CBS.xlsx
//   npm run cbs:expand -- --dry-run    print the plan, write nothing
//   npm run cbs:expand -- --in <path> --out <path>
//
// Refuses to run on a file that is already expanded, so pointing it at its
// own output is safe. The output is wholly regenerated: fix the MASTER, never
// the expanded file, or the fix is gone on the next run. Run it before
// `cbs:import`.
import { CBS_MASTER_PATH, CBS_WORKBOOK_PATH } from "../prisma/cbs-sheet";
import { CBS_EXPANDED_SHEET, expandCbsWorkbook } from "../prisma/cbs-expand";
import { COST_TYPE_RULES } from "../src/lib/cbs-workbook-expand";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const option = (flag: string, fallback: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const inPath = option("--in", CBS_MASTER_PATH);
const outPath = option("--out", CBS_WORKBOOK_PATH);

async function main() {
  const { master, plan, bytes } = await expandCbsWorkbook({
    inPath,
    outPath,
    write: !dryRun,
  });

  console.log(
    `${inPath} [${master.sheet}]: ${plan.stats.masterRows.toLocaleString()} master rows`,
  );
  console.log(`\nexpanded rows: ${plan.stats.total.toLocaleString()}`);
  console.log(
    `  ${String(plan.stats.originals).padStart(6)}  Original (-0 roll-up)`,
  );
  for (const rule of COST_TYPE_RULES) {
    console.log(
      `  ${String(plan.stats.generated[rule.rowType]).padStart(6)}  ${rule.rowType} (-${rule.type})`,
    );
  }
  if (plan.stats.materialBothSplit) {
    console.log(
      `  ${plan.stats.materialBothSplit} account(s) with Material Type Both became a Bulk and a Tagged material row`,
    );
  }
  for (const w of plan.warnings) console.log(`  warning: ${w}`);

  if (plan.problems.length > 0) {
    console.error(`\nrefusing to write: ${plan.problems.length} problem(s)`);
    for (const p of plan.problems.slice(0, 20)) console.error(`  ${p}`);
    if (plan.problems.length > 20) {
      console.error(`  ...and ${plan.problems.length - 20} more`);
    }
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log(`\n--dry-run: ${outPath} not written.`);
    return;
  }
  console.log(
    `\nwrote ${outPath} [${CBS_EXPANDED_SHEET}]: ${plan.stats.total.toLocaleString()} rows, ${(bytes ?? 0).toLocaleString()} bytes`,
  );
  console.log("\nNext: npm run cbs:import -- --dry-run");
}

main().catch((err) => {
  if ((err as NodeJS.ErrnoException)?.code === "EBUSY") {
    console.error(`${outPath} is open in Excel; close it and run again.`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

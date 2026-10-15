// Keeps `Role.disciplines` in step with the discipline list in
// src/config/disciplines.ts. Two independent jobs:
//
//   1. Roles with an EMPTY list get every take-off discipline — the original
//      backfill, for roles created before the field existed.
//   2. Roles get any discipline that NO role references yet. That is what a
//      newly added discipline looks like from the database's side, and without
//      this step it is missing from every take-off Role dropdown. Adding Grout
//      needed its own one-off script for exactly this; adding Specialty
//      Services did not.
//
// A discipline that some roles have and others do not is left alone: that is
// deliberate scoping (a sub who only does piping), not drift.
//
// Idempotent. Run:  npx tsx scripts/backfill-role-disciplines.ts [--dry-run]
import "dotenv/config";
import { prisma } from "../src/server/db";
import { FEF_DISCIPLINES } from "../src/config/disciplines";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const allDisciplineIds = FEF_DISCIPLINES.map((d) => d.id);
  const roles = await prisma.role.findMany({
    select: { id: true, name: true, disciplines: true },
    orderBy: { id: "asc" },
  });

  const empty = roles.filter((r) => r.disciplines.length === 0);
  const populated = roles.filter((r) => r.disciplines.length > 0);

  // Referenced by at least one role that has made a choice at all.
  const referenced = new Set(populated.flatMap((r) => r.disciplines));
  const unreferenced = allDisciplineIds.filter((id) => !referenced.has(id));

  if (empty.length === 0 && unreferenced.length === 0) {
    console.log("Every role is in step with the discipline list.");
    return;
  }

  if (empty.length > 0) {
    console.log(
      `${dryRun ? "Would backfill" : "Backfilling"} ${empty.length} role(s) with all ${allDisciplineIds.length} disciplines:`,
    );
    for (const r of empty) console.log(`  - ${r.name}`);
    if (!dryRun) {
      await prisma.role.updateMany({
        where: { disciplines: { isEmpty: true } },
        data: { disciplines: allDisciplineIds },
      });
    }
  }

  if (unreferenced.length > 0) {
    const targets = populated.filter((r) =>
      unreferenced.some((id) => !r.disciplines.includes(id)),
    );
    console.log(
      `\n${dryRun ? "Would add" : "Adding"} ${unreferenced.join(", ")} to ${targets.length} role(s) — no role references ${unreferenced.length === 1 ? "it" : "them"} yet.`,
    );
    if (!dryRun) {
      for (const r of targets) {
        await prisma.role.update({
          where: { id: r.id },
          data: {
            disciplines: [
              ...r.disciplines,
              ...unreferenced.filter((id) => !r.disciplines.includes(id)),
            ],
          },
        });
      }
    }
  }

  if (dryRun) console.log("\n--dry-run: no changes written.");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

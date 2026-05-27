import "dotenv/config";
import { prisma } from "../src/server/db";
import { disciplines } from "../src/config/disciplines";

async function main() {
  const allDisciplineIds = disciplines
    .filter((d) => d.l1Codes && d.l1Codes.length > 0)
    .map((d) => d.id);

  const empty = await prisma.role.findMany({
    where: { disciplines: { isEmpty: true } },
    select: { id: true, name: true },
  });

  if (empty.length === 0) {
    console.log("No roles with empty disciplines — nothing to backfill.");
    return;
  }

  await prisma.role.updateMany({
    where: { disciplines: { isEmpty: true } },
    data: { disciplines: allDisciplineIds },
  });

  console.log(
    `Backfilled ${empty.length} role${empty.length === 1 ? "" : "s"} with ${allDisciplineIds.length} disciplines:`,
  );
  for (const r of empty) console.log(`  - ${r.name}`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Grants the browser test account the least access it needs to be useful:
 * APPROVER on ONE project.
 *
 * That reaches every take-off sheet plus the APPROVER-gated controls (freeze
 * rates, refresh rates, custom columns) without letting the account see other
 * projects, delete anything, or use the admin-only actions. Deliberately not
 * ADMINISTRATOR — this runs against the real database.
 *
 * Re-runnable. To revoke: delete the Clerk user, or set this row back to USER
 * and clear its project assignment.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

const email = process.env.BROWSER_TEST_EMAIL;
if (!email) throw new Error("BROWSER_TEST_EMAIL missing from .env");

const user = await prisma.user.findFirst({ where: { email } });
if (!user) {
  console.error(
    `No app user for ${email}. Sign in once with the driver first — the app\n` +
      "creates its User row on first sign-in.",
  );
  process.exit(1);
}

// Lowest-numbered project keeps this deterministic across runs.
const project = await prisma.project.findFirst({ orderBy: { id: "asc" } });
if (!project) throw new Error("No projects exist to assign.");

const updated = await prisma.user.update({
  where: { id: user.id },
  data: { role: "APPROVER", projects: { set: [{ id: project.id }] } },
  select: { id: true, email: true, role: true, projects: { select: { id: true, displayId: true, name: true } } },
});
console.log("Granted:", JSON.stringify(updated, null, 2));
await prisma.$disconnect();

/**
 * Repairs User rows whose stored `clerkId` no longer resolves.
 *
 * A Clerk id is not permanent: delete and re-create an account, or move Clerk
 * instances, and the old id stops resolving forever while the row keeps the
 * user's role and project grants. Because `User.email` is unique, the app
 * cannot create a replacement row either — it fails with P2002 and the user
 * resolves to nothing at all: no role, no projects, every guard throwing.
 *
 * `resolveCurrentUser` now re-links by email on sign-in, so this script is only
 * needed to repair rows before a deploy reaches them, or to see the damage.
 *
 * Touches a row only when ALL of these hold:
 *   - the stored id 404s at Clerk,
 *   - exactly one live Clerk account owns that email,
 *   - no other row already holds the live id.
 *
 * Usage (dry run prints what it would do and writes nothing):
 *   npx tsx scripts/relink-clerk-ids.ts
 *   npx tsx scripts/relink-clerk-ids.ts --apply
 *
 * Reads DATABASE_URL and CLERK_SECRET_KEY from .env — CHECK WHICH DATABASE AND
 * WHICH CLERK INSTANCE THOSE POINT AT before passing --apply. The two must be
 * the pair that actually run together, or this will point rows at ids from the
 * wrong instance.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

const APPLY = process.argv.includes("--apply");
const url = `${process.env.DATABASE_URL}`;
console.log(`DB host: ${/@([^/]+)\//.exec(url)?.[1] ?? "?"}`);
console.log(`mode: ${APPLY ? "APPLY (writes)" : "DRY RUN"}\n`);

const key = process.env.CLERK_SECRET_KEY!;
const api = async (p: string) => {
  const r = await fetch(`https://api.clerk.com/v1${p}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const rows = await prisma.user.findMany({
  select: {
    id: true,
    clerkId: true,
    email: true,
    role: true,
    _count: { select: { projects: true } },
  },
  orderBy: { id: "asc" },
});

let fixed = 0;
for (const row of rows) {
  // Only rows whose stored id no longer resolves are candidates.
  const stored = await api(`/users/${row.clerkId}`);
  if (stored.status === 200) continue;

  // ...and only when exactly one live Clerk account owns that email.
  const live = (
    await api(`/users?email_address=${encodeURIComponent(row.email)}`)
  ).body as any[];
  if (!Array.isArray(live) || live.length !== 1) {
    console.log(
      `SKIP  ${row.email} — stored id dead, but ${live?.length ?? 0} live Clerk accounts for that email`,
    );
    continue;
  }
  const newId = live[0].id;
  if (newId === row.clerkId) continue;

  // Refuse if that id is already on another row — re-pointing would break it.
  const taken = await prisma.user.findUnique({
    where: { clerkId: newId },
    select: { id: true, email: true },
  });
  if (taken) {
    console.log(
      `SKIP  ${row.email} — live id ${newId} already belongs to row ${taken.id} (${taken.email})`,
    );
    continue;
  }

  console.log(
    `${APPLY ? "FIX  " : "WOULD"} ${row.email.padEnd(32)} role=${row.role} projects=${row._count.projects}`,
  );
  console.log(`        ${row.clerkId}  ->  ${newId}`);
  if (APPLY) {
    await prisma.user.update({
      where: { id: row.id },
      data: { clerkId: newId },
    });
  }
  fixed++;
}

console.log(
  `\n${APPLY ? "rows updated" : "rows that would be updated"}: ${fixed}`,
);
await prisma.$disconnect();

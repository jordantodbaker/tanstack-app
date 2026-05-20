import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { prisma } from "../server/db";
import {
  hasAtLeastRole,
  type AdminUser,
  type CurrentUser,
  type UserRole,
} from "./users";

/**
 * SERVER-ONLY. This module imports `prisma` and Clerk's server SDK, so it must
 * never enter the client bundle. It is only ever reached through
 * `createServerFn().handler()` bodies (in `users.ts` and `projects.ts`), which
 * TanStack Start strips from the client build. Do not import it from client
 * code — keep client-safe role helpers in `users.ts`.
 */

/**
 * Emails granted ADMINISTRATOR automatically on sign-in. Bootstrap mechanism
 * so the first admin exists without manual DB editing; promotes (never
 * demotes) and is reconciled on every load so these accounts can't be locked
 * out. Real admin management happens later via UI, not this list.
 */
const BOOTSTRAP_ADMIN_EMAILS = ["jordantodbaker@gmail.com"];

function toCurrentUser(row: {
  id: number;
  clerkId: string;
  email: string;
  role: string;
}): CurrentUser {
  return {
    id: row.id,
    clerkId: row.clerkId,
    email: row.email,
    role: row.role as UserRole,
  };
}

function primaryEmail(clerkUser: {
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): string {
  const primary = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  );
  return (primary ?? clerkUser.emailAddresses[0])?.emailAddress ?? "";
}

/**
 * Resolves the signed-in Clerk user to a local `User` row, creating it on
 * first sight (lazy sync). Bootstrap admin emails are promoted on every call.
 * Returns null when nobody is signed in.
 */
export async function resolveCurrentUser(): Promise<CurrentUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) {
    const shouldPromote =
      existing.role !== "ADMINISTRATOR" &&
      BOOTSTRAP_ADMIN_EMAILS.includes(existing.email.toLowerCase());
    if (shouldPromote) {
      const promoted = await prisma.user.update({
        where: { clerkId: userId },
        data: { role: "ADMINISTRATOR" },
      });
      return toCurrentUser(promoted);
    }
    return toCurrentUser(existing);
  }

  const clerkUser = await clerkClient().users.getUser(userId);
  const email = primaryEmail(clerkUser);
  const role: UserRole = BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase())
    ? "ADMINISTRATOR"
    : "USER";
  const created = await prisma.user.create({
    data: { clerkId: userId, email, role },
  });
  return toCurrentUser(created);
}

/**
 * Server-side guard for use inside server functions. Throws if the caller is
 * signed out or lacks `minimum` privilege; otherwise returns the resolved user.
 */
export async function requireRole(minimum: UserRole): Promise<CurrentUser> {
  const user = await resolveCurrentUser();
  if (!user) throw new Error("Unauthorized: not signed in");
  if (!hasAtLeastRole(user.role, minimum)) {
    throw new Error(`Forbidden: requires ${minimum} privilege`);
  }
  return user;
}

/** Convenience guard: requires ADMINISTRATOR privilege. */
export const requireAdmin = (): Promise<CurrentUser> =>
  requireRole("ADMINISTRATOR");

function toAdminUser(row: {
  id: number;
  email: string;
  role: string;
  createdAt: Date;
}): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lists every synced user, admins first. Admin-only. */
export async function listUsers(): Promise<AdminUser[]> {
  await requireAdmin();
  const rows = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { email: "asc" }],
  });
  return rows.map(toAdminUser);
}

/**
 * Changes a user's role. Admin-only. Blocks admins from removing their own
 * administrator access so they can't lock themselves out.
 */
export async function setUserRole(
  userId: number,
  role: UserRole,
): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (userId === admin.id && role !== "ADMINISTRATOR") {
    throw new Error("You cannot remove your own administrator access.");
  }
  const row = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
  return toAdminUser(row);
}

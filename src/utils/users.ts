import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { prisma } from "../server/db";

/**
 * Privilege levels, ordered low → high. Extensible: add a value to the
 * `UserRole` enum in schema.prisma and a matching entry in ROLE_RANK.
 */
export type UserRole = "USER" | "ADMINISTRATOR";

/**
 * Privilege ranking. Higher number = more privilege. To add an intermediate
 * level later (e.g. MANAGER), add the enum value in schema.prisma and slot a
 * rank between USER and ADMINISTRATOR (renumbering as needed).
 */
export const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  ADMINISTRATOR: 1,
};

/** True when `role` holds at least `minimum` privilege. */
export function hasAtLeastRole(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Emails granted ADMINISTRATOR automatically on sign-in. This is the bootstrap
 * mechanism so the first admin exists without manual DB editing; it promotes
 * (never demotes) and is reconciled on every load so these accounts can't be
 * locked out. Real admin management happens later via UI, not this list.
 */
const BOOTSTRAP_ADMIN_EMAILS = ["jordantodbaker@gmail.com"];

export type CurrentUser = {
  id: number;
  clerkId: string;
  email: string;
  role: UserRole;
};

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
 * Returns null when nobody is signed in. Plain async function — safe to call
 * from any server function as an auth gate.
 */
async function resolveCurrentUser(): Promise<CurrentUser | null> {
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

/** Returns the signed-in user (with role), or null when signed out. */
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  (): Promise<CurrentUser | null> => resolveCurrentUser(),
);

export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: ["currentUser"],
    queryFn: () => fetchCurrentUser(),
    staleTime: 5 * 60 * 1000,
  });

/**
 * Server-side guard for use inside other server functions. Throws if the
 * caller is signed out or lacks `minimum` privilege; otherwise returns the
 * resolved user.
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

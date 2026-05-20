import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { listUsers, resolveCurrentUser, setUser } from "./users.server";

/**
 * CLIENT-SAFE. This module is imported by client code (`use-current-user.ts`,
 * routes), so it must not statically import `prisma` or Clerk's server SDK.
 * All server-only logic lives in `users.server.ts` and is reached only through
 * the `createServerFn().handler()` below, whose body TanStack Start strips
 * from the client build.
 */

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

/** Human-readable labels. Add an entry when adding a new UserRole. */
export const ROLE_LABELS: Record<UserRole, string> = {
  USER: "User",
  ADMINISTRATOR: "Administrator",
};

export type CurrentUser = {
  id: number;
  clerkId: string;
  email: string;
  role: UserRole;
};

/** A synced user as shown in the admin Users table. */
export type AdminUser = {
  id: number;
  email: string;
  role: UserRole;
  /** Projects this user is assigned to. Admins implicitly access every
   *  project regardless of this list. */
  projects: { id: number; displayId: string; name: string }[];
  createdAt: string;
};

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

/** Lists every synced user. Admin-only (gated server-side). */
export const fetchUsers = createServerFn({ method: "GET" }).handler(
  (): Promise<AdminUser[]> => listUsers(),
);

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ["adminUsers"],
    queryFn: () => fetchUsers(),
  });

/** Updates a user's role and project assignments. Admin-only (gated
 *  server-side). `projectIds` replaces the full set. */
export const updateUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { userId: number; role: UserRole; projectIds: number[] }) =>
      input,
  )
  .handler(({ data }): Promise<AdminUser> =>
    setUser(data.userId, data.role, data.projectIds),
  );

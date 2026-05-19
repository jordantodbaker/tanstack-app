import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentUser } from "./users.server";

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

export type CurrentUser = {
  id: number;
  clerkId: string;
  email: string;
  role: UserRole;
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

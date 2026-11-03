import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { listUsers, resolveCurrentUser, setUser } from "./users.server";
import { parseSetUser } from "~/lib/validators";

/**
 * CLIENT-SAFE. This module is imported by client code (`use-current-user.ts`,
 * routes), so it must not statically import `prisma` or Clerk's server SDK.
 * All server-only logic lives in `users.server.ts` and is reached only through
 * the `createServerFn().handler()` below, whose body TanStack Start strips
 * from the client build.
 */

// The roles themselves, the checks on them and the user shapes are pure and
// live in `~/lib/roles`; re-exported here so existing imports keep working.
// Code that needs only those should import them from there.
import {
  ROLE_LABELS,
  ROLE_RANK,
  assertProjectUnchanged,
  assertRole,
  hasAtLeastRole,
  type AdminUser,
  type CurrentUser,
  type UserRole,
} from "~/lib/roles";
export {
  ROLE_LABELS,
  ROLE_RANK,
  assertProjectUnchanged,
  assertRole,
  hasAtLeastRole,
  type AdminUser,
  type CurrentUser,
  type UserRole,
};

/** Returns the signed-in user (with role), or null when signed out. */
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  (): Promise<CurrentUser | null> => resolveCurrentUser(),
);

export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: qk.users.current(),
    queryFn: () => fetchCurrentUser(),
    staleTime: 5 * 60 * 1000,
  });

/** Lists every synced user. Admin-only (gated server-side). */
export const fetchUsers = createServerFn({ method: "GET" }).handler(
  (): Promise<AdminUser[]> => listUsers(),
);

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: qk.users.admin(),
    queryFn: () => fetchUsers(),
    // User and project admin mutations invalidate this via
    // `invalidateAdminEntity` — refetch timers are wasted work.
    staleTime: Infinity,
  });

/** Updates a user's role and project assignments. Admin-only (gated
 *  server-side). `projectIds` replaces the full set. */
export const updateUser = createServerFn({ method: "POST" })
  .inputValidator(parseSetUser)
  .handler(({ data }): Promise<AdminUser> =>
    setUser(data.userId, data.role, data.projectIds),
  );

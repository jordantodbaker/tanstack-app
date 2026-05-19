import { useQuery } from "@tanstack/react-query";
import {
  currentUserQueryOptions,
  hasAtLeastRole,
  type CurrentUser,
  type UserRole,
} from "~/utils/users";

/**
 * Reads the signed-in user (with role) from the server, cached by React
 * Query. `data` is null when signed out, undefined while loading.
 */
export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}

/**
 * True when the signed-in user holds at least `minimum` privilege. Returns
 * false while loading or signed out.
 */
export function useHasRole(minimum: UserRole): boolean {
  const { data } = useCurrentUser();
  return data ? hasAtLeastRole(data.role, minimum) : false;
}

/** True when the signed-in user is an ADMINISTRATOR. */
export function useIsAdmin(): boolean {
  return useHasRole("ADMINISTRATOR");
}

export type { CurrentUser, UserRole };

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "selectedProjectId";

export const getProjectIdFromCookie = createServerFn({ method: "GET" }).handler(
  () => {
    const value = getCookie(COOKIE_NAME);
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  },
);

/**
 * Universal projectId resolver for route loaders. Uses the server-side cookie
 * during SSR and falls back to localStorage on the client (SPA nav).
 */
export async function readProjectIdForLoader(): Promise<number | null> {
  if (typeof window === "undefined") {
    return await getProjectIdFromCookie();
  }
  const raw = window.localStorage.getItem(COOKIE_NAME);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Wraps a project-scoped prefetch (e.g. `ensureQueryData(...)`) so it never
 * fails the loader on a stale cookie projectId. The signed-in user may have
 * lost access to the project the cookie still points at; when that happens
 * the underlying server fn throws via `requireProjectAccess`. The page must
 * still render — `ProjectGuard` surfaces the not-assigned / no-selection
 * state on render and its auto-clear effect resets the stale cookie. Failures
 * here are intentionally not logged: they're expected.
 */
export async function tryPrefetchProjectQuery<T>(
  p: Promise<T>,
): Promise<void> {
  try {
    await p;
  } catch {
    // Expected on stale cookie projectId — UI handles the empty state.
  }
}

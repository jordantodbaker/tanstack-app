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

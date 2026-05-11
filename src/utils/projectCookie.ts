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

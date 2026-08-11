import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { prisma } from "../server/db";
import { getLatestVersionId } from "./versions.server";

const COOKIE_NAME = "selectedVersionId";

export const getVersionIdFromCookie = createServerFn({ method: "GET" }).handler(
  () => {
    const value = getCookie(COOKIE_NAME);
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  },
);

/**
 * Read the raw persisted versionId (cookie during SSR, localStorage on client).
 * May be null (first visit) or stale (points at another project's version) —
 * callers that need a version guaranteed to belong to a project should use
 * `resolveVersionIdForLoader` instead.
 */
export async function readVersionIdForLoader(): Promise<number | null> {
  if (typeof window === "undefined") {
    return await getVersionIdFromCookie();
  }
  const raw = window.localStorage.getItem(COOKIE_NAME);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const ResolveVersionSchema = z.object({
  projectId: z.number().int().positive(),
  persisted: z.number().int().positive().nullable(),
});

// Server-side resolution so SSR prefetches the version the user actually has
// selected: keep `persisted` when it belongs to this project, else the latest.
const resolveVersionForProject = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ResolveVersionSchema.parse(input))
  .handler(async ({ data }): Promise<number | null> => {
    if (data.persisted !== null) {
      const owns = await prisma.estimateVersion.findFirst({
        where: { id: data.persisted, projectId: data.projectId },
        select: { id: true },
      });
      if (owns) return owns.id;
    }
    return await getLatestVersionId(data.projectId);
  });

/**
 * Resolve the versionId a route loader should prefetch for `projectId`: the
 * persisted selection when it belongs to this project, otherwise the project's
 * latest version. Returns null when there's no project. The prefetch is only an
 * optimization — the client's SelectedVersionProvider re-resolves after
 * hydration — so any mismatch self-corrects rather than erroring.
 */
export async function resolveVersionIdForLoader(
  projectId: number | null,
): Promise<number | null> {
  if (projectId === null) return null;
  const persisted = await readVersionIdForLoader();
  return await resolveVersionForProject({ data: { projectId, persisted } });
}

import { prisma } from "../server/db";
import { allocateEntityNumberValue } from "./entityNumbers.server";

/**
 * SERVER-ONLY prisma helpers for estimate versions. Kept out of `versions.ts`
 * because they're exported *plain functions* that touch `prisma` — an exported
 * `function` in a client-reachable module drags the Node-only Prisma client
 * into the browser bundle (see `no-prisma-in-client.test.ts`). A `.server.ts`
 * module is stripped from the client graph, so these are safe here.
 */

/**
 * Guarantee a project has at least one estimate version. Called lazily from
 * `fetchVersions` (covers projects created before versioning and any backfill
 * gaps) and eagerly when a project is created. Idempotent and race-safe: the
 * `@@unique([projectId, versionNumber])` constraint plus the atomic
 * `NumberSequence` increment mean a concurrent create can't produce a duplicate.
 */
export async function ensureProjectHasVersion(projectId: number): Promise<void> {
  const existing = await prisma.estimateVersion.count({ where: { projectId } });
  if (existing > 0) return;
  await prisma.$transaction(async (tx) => {
    const inTx = await tx.estimateVersion.count({ where: { projectId } });
    if (inTx > 0) return;
    const { value } = await allocateEntityNumberValue(
      tx,
      projectId,
      "EstimateVersion",
    );
    await tx.estimateVersion.create({
      // Name left blank — the display label ("v1") comes from versionNumber.
      data: { projectId, versionNumber: value, name: "" },
    });
  });
}

/**
 * The version the UI should default to for a project (highest versionNumber),
 * creating an initial one if none exists. Server helper for route loaders that
 * need a versionId before the client's selected-version context has hydrated.
 */
export async function getLatestVersionId(projectId: number): Promise<number> {
  await ensureProjectHasVersion(projectId);
  const latest = await prisma.estimateVersion.findFirstOrThrow({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  return latest.id;
}

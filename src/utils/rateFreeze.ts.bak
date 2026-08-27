import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import { ProjectId, VersionId } from "~/lib/validators";
import {
  hasAtLeastRole,
  type CurrentUser,
} from "./users";
import { requireProjectAccess, requireAdmin } from "./users.server";
import { recordUpdate } from "./audit.server";
import { resolveRoleIdRates, type RoleIdRate } from "~/lib/role-rates";

/**
 * SERVER-ONLY. Freezing and unfreezing labor rates.
 *
 * Rates resolve version → project → global (see `~/lib/role-rates`). Those
 * scoped books are normally sparse — a handful of deliberate overrides.
 * "Freezing" is the same mechanism used exhaustively: it materializes the FULL
 * effective rate book into the scope, so nothing is left falling through to a
 * global rate that could change later.
 *
 * Why the full book rather than just the roles a sheet currently uses: a
 * partial freeze isn't a freeze. Materialize only today's roles and the first
 * new line for an unfrozen craft silently prices at whatever global says
 * then — exactly the drift freezing exists to stop.
 *
 * Freezing is deliberate and reversible, never automatic. A version created
 * today tracks live rates until somebody freezes it, which is usually when the
 * revision is issued.
 */

const FreezeVersionInput = z.object({ versionId: VersionId });
const FreezeProjectInput = z.object({ projectId: ProjectId });

export type FreezeResult = {
  /** How many (role, schedule) rates were written. */
  ratesFrozen: number;
  frozenAt: string;
};

/** Freezing changes what every estimate in scope prices at — APPROVER+. */
function assertMayFreeze(actor: CurrentUser): void {
  if (!hasAtLeastRole(actor.role, "APPROVER")) {
    throw new Error("Forbidden: freezing rates requires APPROVER privilege");
  }
}

/** The global rate book as id-keyed rows. */
function readGlobalRates(
  tx: Pick<typeof prisma, "roleRate">,
): Promise<RoleIdRate[]> {
  return tx.roleRate.findMany({
    select: { roleId: true, schedule: true, rate: true },
  });
}

/**
 * Freeze one estimate version at its current effective rates.
 *
 * Resolves global + the project's overrides, then writes the result as
 * version-scoped rows. Refuses when the version is already frozen: re-freezing
 * would re-materialize at TODAY's rates, quietly repricing the revision it was
 * meant to protect. Unfreeze first if that is genuinely what you want.
 */
export const freezeVersionRates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FreezeVersionInput.parse(input))
  .handler(async ({ data }): Promise<FreezeResult> => {
    const pre = await prisma.estimateVersion.findUniqueOrThrow({
      where: { id: data.versionId },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(pre.projectId);
    assertMayFreeze(actor);

    const frozenAt = new Date();
    const ratesFrozen = await prisma.$transaction(async (tx) => {
      const version = await tx.estimateVersion.findUniqueOrThrow({
        where: { id: data.versionId },
        select: { projectId: true, ratesFrozenAt: true },
      });
      if (version.ratesFrozenAt !== null) {
        throw new Error(
          "This version's rates are already frozen. Unfreeze it first if you " +
            "intend to re-freeze at current rates.",
        );
      }

      const [globalRates, projectRates] = await Promise.all([
        readGlobalRates(tx),
        tx.projectRoleRate.findMany({
          where: { projectId: version.projectId },
          select: { roleId: true, schedule: true, rate: true },
        }),
      ]);

      const effective = resolveRoleIdRates(globalRates, projectRates);
      if (effective.length > 0) {
        await tx.versionRoleRate.createMany({
          data: effective.map((r) => ({ versionId: data.versionId, ...r })),
        });
      }
      await tx.estimateVersion.update({
        where: { id: data.versionId },
        data: { ratesFrozenAt: frozenAt, ratesFrozenById: actor.id },
      });
      await recordUpdate(
        tx,
        {
          entityType: "EstimateVersion",
          entityId: data.versionId,
          projectId: version.projectId,
          actor,
        },
        [
          {
            field: "ratesFrozenAt",
            oldValue: null,
            newValue: frozenAt.toISOString(),
          },
        ],
        `Froze ${effective.length} labor rate(s).`,
      );
      return effective.length;
    });

    return { ratesFrozen, frozenAt: frozenAt.toISOString() };
  });

/**
 * Release a version back to live rates: drop its materialized rows and clear
 * the marker.
 *
 * Admin-only, and deliberately blunt — it discards the frozen numbers rather
 * than archiving them, so a re-freeze prices at today's book. Any deliberate
 * per-version overrides that predated the freeze are discarded with it; they
 * were indistinguishable from the materialized rows the moment freezing wrote
 * over the same scope.
 */
export const unfreezeVersionRates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FreezeVersionInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await requireAdmin();
    await prisma.$transaction(async (tx) => {
      const version = await tx.estimateVersion.findUniqueOrThrow({
        where: { id: data.versionId },
        select: { projectId: true, ratesFrozenAt: true },
      });
      if (version.ratesFrozenAt === null) {
        throw new Error("This version's rates are not frozen.");
      }
      await tx.versionRoleRate.deleteMany({
        where: { versionId: data.versionId },
      });
      await tx.estimateVersion.update({
        where: { id: data.versionId },
        data: { ratesFrozenAt: null, ratesFrozenById: null },
      });
      await recordUpdate(
        tx,
        {
          entityType: "EstimateVersion",
          entityId: data.versionId,
          projectId: version.projectId,
          actor,
        },
        [
          {
            field: "ratesFrozenAt",
            oldValue: version.ratesFrozenAt.toISOString(),
            newValue: null,
          },
        ],
        "Released version back to live rates.",
      );
    });
    return { ok: true };
  });

/**
 * Freeze a whole project at the current global rates.
 *
 * The project layer has no book above it but global, so this simply copies
 * global down. Versions of the project keep resolving version → project →
 * global, so an already-frozen version is unaffected: its own rows still win.
 */
export const freezeProjectRates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FreezeProjectInput.parse(input))
  .handler(async ({ data }): Promise<FreezeResult> => {
    const actor = await requireProjectAccess(data.projectId);
    assertMayFreeze(actor);

    const frozenAt = new Date();
    const ratesFrozen = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: data.projectId },
        select: { ratesFrozenAt: true },
      });
      if (project.ratesFrozenAt !== null) {
        throw new Error(
          "This project's rates are already frozen. Unfreeze it first if you " +
            "intend to re-freeze at current rates.",
        );
      }

      const globalRates = await readGlobalRates(tx);
      // A project may already carry deliberate overrides. Those must WIN over
      // the global book being copied down — freezing must not undo a
      // negotiated rate — so they form the higher-precedence layer, and the
      // upsert below leaves them as they are.
      const existing = await tx.projectRoleRate.findMany({
        where: { projectId: data.projectId },
        select: { roleId: true, schedule: true, rate: true },
      });
      const effective = resolveRoleIdRates(globalRates, existing);
      const existingKeys = new Set(
        existing.map((r) => `${r.roleId}:${r.schedule}`),
      );
      const toCreate = effective.filter(
        (r) => !existingKeys.has(`${r.roleId}:${r.schedule}`),
      );
      if (toCreate.length > 0) {
        await tx.projectRoleRate.createMany({
          data: toCreate.map((r) => ({ projectId: data.projectId, ...r })),
        });
      }
      await tx.project.update({
        where: { id: data.projectId },
        data: { ratesFrozenAt: frozenAt, ratesFrozenById: actor.id },
      });
      await recordUpdate(
        tx,
        {
          entityType: "Project",
          entityId: data.projectId,
          projectId: data.projectId,
          actor,
        },
        [
          {
            field: "ratesFrozenAt",
            oldValue: null,
            newValue: frozenAt.toISOString(),
          },
        ],
        `Froze ${effective.length} labor rate(s).`,
      );
      return effective.length;
    });

    return { ratesFrozen, frozenAt: frozenAt.toISOString() };
  });

/** Release a project back to live rates. Admin-only, mirrors the version path. */
export const unfreezeProjectRates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FreezeProjectInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await requireAdmin();
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: data.projectId },
        select: { ratesFrozenAt: true },
      });
      if (project.ratesFrozenAt === null) {
        throw new Error("This project's rates are not frozen.");
      }
      await tx.projectRoleRate.deleteMany({
        where: { projectId: data.projectId },
      });
      await tx.project.update({
        where: { id: data.projectId },
        data: { ratesFrozenAt: null, ratesFrozenById: null },
      });
      await recordUpdate(
        tx,
        {
          entityType: "Project",
          entityId: data.projectId,
          projectId: data.projectId,
          actor,
        },
        [
          {
            field: "ratesFrozenAt",
            oldValue: project.ratesFrozenAt.toISOString(),
            newValue: null,
          },
        ],
        "Released project back to live rates.",
      );
    });
    return { ok: true };
  });

/**
 * Cache-bust after any freeze/unfreeze. Every scoped variant of the role-data
 * cache has to drop — the grid's resolved rates just changed — along with the
 * version and project lists that surface the frozen badge.
 */
export function invalidateRateFreezeQueries(
  queryClient: QueryClient,
  projectId: number | null,
): void {
  // Prefix match: covers every (discipline, project, version) variant.
  queryClient.invalidateQueries({ queryKey: qk.roles.dataAll() });
  queryClient.invalidateQueries({ queryKey: qk.versions(projectId) });
  queryClient.invalidateQueries({ queryKey: qk.projects() });
}

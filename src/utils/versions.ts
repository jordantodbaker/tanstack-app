import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import {
  requireAdmin,
  projectIdScopedHandler,
  requireProjectAccess,
  versionScopedHandler,
} from "./users.server";
import { allocateEntityNumberValue } from "./entityNumbers.server";
import { ensureProjectHasVersion } from "./versions.server";
import { FEF_DATA_COLUMNS } from "~/lib/fef-helpers";
import { ProjectId, VersionId, parseProjectIdInput } from "~/lib/validators";

/**
 * Estimate versions — named, independently-editable revisions of a project's
 * estimate. Each version owns its own `FefRow` line items and `BasisInputs`;
 * creating one (optionally copying from an existing version) never touches the
 * others. `versionNumber` is per-project and gap-free, allocated through the
 * same `NumberSequence` machinery as CVR/FCO/RFI numbers.
 */

export type EstimateVersionOption = {
  id: number;
  versionNumber: number;
  name: string;
  description: string;
  parentVersionId: number | null;
  createdAt: string;
};

type EstimateVersionRow = {
  id: number;
  versionNumber: number;
  name: string;
  description: string;
  parentVersionId: number | null;
  createdAt: Date;
};

const toOption = (v: EstimateVersionRow): EstimateVersionOption => ({
  id: v.id,
  versionNumber: v.versionNumber,
  name: v.name,
  description: v.description,
  parentVersionId: v.parentVersionId,
  createdAt: v.createdAt.toISOString(),
});

// Every FefRow column copied when branching a version, except the identity
// columns rewritten by the copy (projectId/versionId) and the timestamps.
// Derived from FEF_DATA_COLUMNS so a new FefRow field flows through the copy
// automatically — no hand-editing here.
const FEF_COPY_COLUMNS = [
  "discipline",
  "section",
  "position",
  ...FEF_DATA_COLUMNS,
] as const;

export const fetchVersions = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(
    projectIdScopedHandler(
      async ({ data: projectId }): Promise<EstimateVersionOption[]> => {
        await ensureProjectHasVersion(projectId);
        const rows = await prisma.estimateVersion.findMany({
          where: { projectId },
          orderBy: { versionNumber: "asc" },
          select: {
            id: true,
            versionNumber: true,
            name: true,
            description: true,
            parentVersionId: true,
            createdAt: true,
          },
        });
        return rows.map(toOption);
      },
    ),
  );

export const versionsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["versions", projectId],
    queryFn: () =>
      projectId === null
        ? Promise.resolve([] as EstimateVersionOption[])
        : fetchVersions({ data: projectId }),
    enabled: projectId !== null,
    // Mutations (create/rename/delete) invalidate ["versions", projectId], so
    // no refetch timer is needed. Used by the version picker on every page.
    staleTime: Infinity,
  });

const CreateVersionSchema = z.object({
  projectId: ProjectId,
  // When set, deep-copy this version's line items + basis into the new one.
  // Must belong to `projectId`. Omit/null to start blank.
  sourceVersionId: VersionId.nullish(),
  name: z.string().optional(),
});

export const createVersion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateVersionSchema.parse(input))
  .handler(async ({ data }): Promise<EstimateVersionOption> => {
    const actor = await requireProjectAccess(data.projectId);
    if (data.sourceVersionId != null) {
      const src = await prisma.estimateVersion.findUnique({
        where: { id: data.sourceVersionId },
        select: { projectId: true },
      });
      if (!src || src.projectId !== data.projectId) {
        throw new Error("Source version does not belong to this project.");
      }
    }
    const created = await prisma.$transaction(async (tx) => {
      const { value } = await allocateEntityNumberValue(
        tx,
        data.projectId,
        "EstimateVersion",
      );
      const version = await tx.estimateVersion.create({
        data: {
          projectId: data.projectId,
          versionNumber: value,
          name: data.name?.trim() ?? "",
          parentVersionId: data.sourceVersionId ?? null,
          createdById: actor.id,
        },
        select: {
          id: true,
          versionNumber: true,
          name: true,
          description: true,
          parentVersionId: true,
          createdAt: true,
        },
      });
      if (data.sourceVersionId != null) {
        // Copy the source's line items in one round-trip. INSERT ... SELECT
        // keeps every column server-side (no marshalling a whole estimate
        // through the app) and runs inside the same transaction as the create.
        const cols = FEF_COPY_COLUMNS.map((c) => `"${c}"`).join(", ");
        await tx.$executeRawUnsafe(
          `INSERT INTO "FefRow" ("projectId", "versionId", ${cols}, "createdAt", "updatedAt")
           SELECT "projectId", $1, ${cols}, NOW(), NOW()
           FROM "FefRow" WHERE "versionId" = $2`,
          version.id,
          data.sourceVersionId,
        );
        const basis = await tx.basisInputs.findUnique({
          where: { versionId: data.sourceVersionId },
        });
        if (basis) {
          await tx.basisInputs.create({
            data: {
              versionId: version.id,
              estimateFactor: basis.estimateFactor,
              compositeLaborRate: basis.compositeLaborRate,
              milestones: basis.milestones as object,
              manpower: basis.manpower as object,
            },
          });
        }
      }
      return version;
    });
    return toOption(created);
  });

const UpdateVersionSchema = z.object({
  versionId: VersionId,
  name: z.string(),
  description: z.string(),
});

export const updateVersion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateVersionSchema.parse(input))
  .handler(
    versionScopedHandler(async ({ data }): Promise<EstimateVersionOption> => {
      const updated = await prisma.estimateVersion.update({
        where: { id: data.versionId },
        data: { name: data.name.trim(), description: data.description.trim() },
        select: {
          id: true,
          versionNumber: true,
          name: true,
          description: true,
          parentVersionId: true,
          createdAt: true,
        },
      });
      return toOption(updated);
    }),
  );

const DeleteVersionSchema = z.object({ versionId: VersionId });

export const deleteVersion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteVersionSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; projectId: number }> => {
    // Deleting a revision is destructive and irreversible, so it's restricted
    // to administrators — not every project member who can edit the estimate.
    await requireAdmin();
    const version = await prisma.estimateVersion.findUnique({
      where: { id: data.versionId },
      select: { projectId: true },
    });
    if (!version) {
      throw new Error(`Estimate version ${data.versionId} not found`);
    }
    const { projectId } = version;
    // A project must always have at least one version — the estimate grid has
    // nothing to load otherwise. Refuse to remove the last one.
    const count = await prisma.estimateVersion.count({ where: { projectId } });
    if (count <= 1) {
      throw new Error("A project must keep at least one estimate version.");
    }
    // Cascades this version's FefRows + BasisInputs (onDelete: Cascade). Any
    // EstimateSnapshot that froze this version keeps its own JSON copy; its
    // `versionId` pointer is SetNull, so historical baselines are unaffected.
    await prisma.estimateVersion.delete({ where: { id: data.versionId } });
    return { ok: true, projectId };
  });

/**
 * The project CBS allow-list — which `CbsItem`s a project may use, as edited on
 * the Setup page. Everything here is about that join table: reading a project's
 * allowed ids, deriving the L1 codes the sidebar filters disciplines by, and
 * the admin-only write.
 *
 * It is NOT the Setup page's whole data layer. The catalog the editor renders
 * comes from `cbsCatalogQueryOptions` in ./cbs, shared with Admin → Master CBS
 * under one query key so an admin who visits both downloads it once.
 */
import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../server/db";
import { adminHandler, projectIdScopedHandler } from "./users.server";
import { Id, ProjectId, parseProjectIdInput } from "../lib/validators";

const UpdateAllowedFefCbsItemsSchema = z.object({
  projectId: ProjectId,
  addIds: z.array(Id),
  removeIds: z.array(Id),
});

export const fetchAllowedFefCbsItemIds = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(
    projectIdScopedHandler(async ({ data: projectId }) => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { allowedFefCbsItems: { select: { id: true } } },
      });
      return project?.allowedFefCbsItems.map((i) => i.id) ?? [];
    }),
  );

export const allowedFefCbsItemIdsQueryOptions = (projectId: number) =>
  queryOptions({
    queryKey: qk.setup.allowedFefCbsItemIds(projectId),
    queryFn: () => fetchAllowedFefCbsItemIds({ data: projectId }),
    staleTime: Infinity,
  });

export const fetchAllowedCbsL1Codes = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(
    projectIdScopedHandler(async ({ data: projectId }) => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { allowedFefCbsItems: { select: { l1: true } } },
      });
      if (!project) return [];
      const set = new Set<string>();
      for (const item of project.allowedFefCbsItems) set.add(item.l1);
      return Array.from(set);
    }),
  );

export const allowedCbsL1CodesQueryOptions = (projectId: number) =>
  queryOptions({
    queryKey: qk.setup.allowedCbsL1Codes(projectId),
    queryFn: () => fetchAllowedCbsL1Codes({ data: projectId }),
    // Sidebar reads this on every page mount. `updateAllowedFefCbsItems`
    // invalidates this key explicitly on save, so refetching on a timer
    // would just re-ship the same payload on every navigation.
    staleTime: Infinity,
  });

/** Admin-only: edits a project's CBS allow-list. */
export const updateAllowedFefCbsItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    UpdateAllowedFefCbsItemsSchema.parse(input),
  )
  .handler(
    adminHandler(async ({ data }) => {
      const { projectId, addIds, removeIds } = data;
      if (addIds.length === 0 && removeIds.length === 0) return { ok: true };
      await prisma.project.update({
        where: { id: projectId },
        data: {
          allowedFefCbsItems: {
            connect: addIds.map((id) => ({ id })),
            disconnect: removeIds.map((id) => ({ id })),
          },
        },
      });
      return { ok: true };
    }),
  );

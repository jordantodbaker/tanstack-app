import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, requireProjectAccess } from "./users.server";

export const fetchSetupCbsItems = createServerFn({ method: "GET" }).handler(
  () =>
    prisma.cbsItem.findMany({
      orderBy: { displayCode: "asc" },
      select: {
        id: true,
        l1: true,
        l2: true,
        l3: true,
        l4: true,
        l5: true,
        l6: true,
        displayCode: true,
        name: true,
        accountDescription: true,
        l2Description: true,
        uom: true,
      },
    }),
);

export const setupCbsItemsQueryOptions = () =>
  queryOptions({
    queryKey: ["setupCbsItems"],
    queryFn: () => fetchSetupCbsItems(),
    // The CBS catalog rarely changes within a session, so cache forever.
    // Avoids re-shipping the entire CbsItem table on every /setup visit.
    staleTime: Infinity,
  });

export const fetchAllowedFefCbsItemIds = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    await requireProjectAccess(projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { allowedFefCbsItems: { select: { id: true } } },
    });
    return project?.allowedFefCbsItems.map((i) => i.id) ?? [];
  });

export const allowedFefCbsItemIdsQueryOptions = (projectId: number) =>
  queryOptions({
    queryKey: ["allowedFefCbsItemIds", projectId],
    queryFn: () => fetchAllowedFefCbsItemIds({ data: projectId }),
    staleTime: Infinity,
  });

export const fetchAllowedCbsL1Codes = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    await requireProjectAccess(projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { allowedFefCbsItems: { select: { l1: true } } },
    });
    if (!project) return [];
    const set = new Set<string>();
    for (const item of project.allowedFefCbsItems) set.add(item.l1);
    return Array.from(set);
  });

export const allowedCbsL1CodesQueryOptions = (projectId: number) =>
  queryOptions({
    queryKey: ["allowedCbsL1Codes", projectId],
    queryFn: () => fetchAllowedCbsL1Codes({ data: projectId }),
  });

/** Admin-only: edits a project's CBS allow-list. */
export const updateAllowedFefCbsItems = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { projectId: number; addIds: number[]; removeIds: number[] }) =>
      input,
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

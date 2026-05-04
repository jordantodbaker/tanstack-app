import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchSetupProjects = createServerFn({ method: "GET" }).handler(
  () =>
    prisma.project.findMany({
      orderBy: { id: "asc" },
      select: { id: true, displayId: true, name: true },
    }),
);

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

export const fetchAllowedFefCbsItemIds = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { allowedFefCbsItems: { select: { id: true } } },
    });
    return project?.allowedFefCbsItems.map((i) => i.id) ?? [];
  });

export const updateAllowedFefCbsItems = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { projectId: number; addIds: number[]; removeIds: number[] }) =>
      input,
  )
  .handler(async ({ data }) => {
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
  });

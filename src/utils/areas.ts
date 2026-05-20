import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, requireProjectAccess } from "./users.server";

export type AreaOption = {
  id: number;
  projectId: number;
  displayId: string;
  name: string;
  description: string;
};

export const fetchAreas = createServerFn({ method: "GET" }).handler(() =>
  prisma.area.findMany({
    orderBy: [{ projectId: "asc" }, { displayId: "asc" }],
    select: {
      id: true,
      projectId: true,
      displayId: true,
      name: true,
      description: true,
    },
  }),
);

export const areasQueryOptions = () =>
  queryOptions({
    queryKey: ["areas"],
    queryFn: () => fetchAreas(),
  });

/** Lightweight area list for a single project, used to populate dropdowns. */
export const fetchAreasByProject = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    await requireProjectAccess(projectId);
    return prisma.area.findMany({
      where: { projectId },
      orderBy: { displayId: "asc" },
      select: { id: true, displayId: true, name: true },
    });
  });

export const areasByProjectQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["areasByProject", projectId],
    queryFn: () =>
      projectId === null
        ? Promise.resolve(
            [] as { id: number; displayId: string; name: string }[],
          )
        : fetchAreasByProject({ data: projectId }),
    enabled: projectId !== null,
  });

export type UpsertAreaInput = {
  id?: number;
  projectId: number;
  displayId: string;
  name: string;
  description: string;
};

/** Create or update an area. Admin-only. */
export const upsertArea = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertAreaInput) => input)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const payload = {
        projectId: data.projectId,
        displayId: data.displayId,
        name: data.name,
        description: data.description,
      };
      if (data.id) {
        await prisma.area.update({ where: { id: data.id }, data: payload });
      } else {
        await prisma.area.create({ data: payload });
      }
      return { ok: true };
    }),
  );

/** Delete an area. Admin-only. */
export const deleteArea = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.area.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

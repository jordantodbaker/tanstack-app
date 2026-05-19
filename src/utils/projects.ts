import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireAdmin } from "./users.server";

export type ProjectOption = {
  id: number;
  displayId: string;
  name: string;
  description: string;
};

export const fetchProjects = createServerFn({ method: "GET" }).handler(() =>
  prisma.project.findMany({
    orderBy: { id: "asc" },
    select: { id: true, displayId: true, name: true, description: true },
  }),
);

export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

export type UpsertProjectInput = {
  id?: number;
  displayId: string;
  name: string;
  description: string;
};

/** Create or update a project. Admin-only. */
export const upsertProject = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertProjectInput) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireAdmin();
    const payload = {
      displayId: data.displayId,
      name: data.name,
      description: data.description,
    };
    if (data.id) {
      await prisma.project.update({ where: { id: data.id }, data: payload });
    } else {
      await prisma.project.create({ data: payload });
    }
    return { ok: true };
  });

/**
 * Delete a project. Admin-only. Cascades to the project's FEF rows, change
 * log, field change orders, and basis inputs (see schema `onDelete: Cascade`).
 */
export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireAdmin();
    await prisma.project.delete({ where: { id: data.id } });
    return { ok: true };
  });

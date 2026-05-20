import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, getAccessibleProjectIds } from "./users.server";

export type ProjectOption = {
  id: number;
  displayId: string;
  name: string;
  description: string;
};

/**
 * Returns the projects the signed-in user may see — every project for
 * admins, only the assigned ones for everyone else. The same filter that
 * gates server-side data also drives the project selector UI.
 */
export const fetchProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectOption[]> => {
    const access = await getAccessibleProjectIds();
    return prisma.project.findMany({
      where: access === "all" ? {} : { id: { in: [...access] } },
      orderBy: { id: "asc" },
      select: { id: true, displayId: true, name: true, description: true },
    });
  },
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
  /** Full set of subcontractor ids assigned to this project (M2M replace). */
  subcontractorIds: number[];
  /**
   * Full set of user ids granted access to this project (M2M replace).
   * Admins always see every project regardless of this set.
   */
  userIds: number[];
  /** Existing area ids to reassign into this project (their `projectId` is
   *  set to this project on save). Areas not listed are untouched. */
  addAreaIds: number[];
};

/**
 * Create or update a project. Admin-only.
 *
 * Project ↔ subcontractor is many-to-many — `subcontractorIds` replaces the
 * full set. Project → area is one-to-many keyed by `Area.projectId`, so
 * `addAreaIds` reassigns those areas into this project; to remove an area
 * from a project, delete it (it can't exist without one).
 */
export const upsertProject = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertProjectInput) => input)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const scalars = {
        displayId: data.displayId,
        name: data.name,
        description: data.description,
      };
      const subRefs = data.subcontractorIds.map((id) => ({ id }));
      const userRefs = data.userIds.map((id) => ({ id }));
      let resultId: number;
      if (data.id) {
        await prisma.project.update({
          where: { id: data.id },
          data: {
            ...scalars,
            subcontractors: { set: subRefs },
            users: { set: userRefs },
          },
        });
        resultId = data.id;
      } else {
        const created = await prisma.project.create({
          data: {
            ...scalars,
            subcontractors: { connect: subRefs },
            users: { connect: userRefs },
          },
        });
        resultId = created.id;
      }
      if (data.addAreaIds.length > 0) {
        await prisma.area.updateMany({
          where: { id: { in: data.addAreaIds } },
          data: { projectId: resultId },
        });
      }
      return { ok: true };
    }),
  );

/**
 * Delete a project. Admin-only. Cascades to the project's FEF rows, change
 * log, field change orders, and basis inputs (see schema `onDelete: Cascade`).
 */
export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.project.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

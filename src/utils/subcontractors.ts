import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, adminHandlerNoInput } from "./users.server";
import { parseIdInput, parseUpsertSubcontractor } from "~/lib/validators";

/**
 * A subcontractor row, with each project it's assigned to flattened to the
 * fields the admin UI needs. `disciplines` are discipline ids from
 * src/config/disciplines.ts.
 */
export type SubcontractorItem = {
  id: number;
  displayId: string;
  name: string;
  description: string;
  disciplines: string[];
  projects: { id: number; displayId: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

type Row = Awaited<
  ReturnType<typeof prisma.subcontractor.findMany>
>[number] & {
  projects: { id: number; displayId: string; name: string }[];
};

const toItem = (r: Row): SubcontractorItem => {
  const { projects, ...rest } = r;
  return {
    ...rest,
    projects,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
};

export const fetchSubcontractors = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<SubcontractorItem[]> => {
    const rows = await prisma.subcontractor.findMany({
      include: {
        projects: { select: { id: true, displayId: true, name: true } },
      },
      orderBy: [{ displayId: "asc" }],
    });
    return rows.map(toItem);
  }),
);

export const subcontractorsQueryOptions = () =>
  queryOptions({
    queryKey: ["subcontractors"],
    queryFn: () => fetchSubcontractors(),
    // Admin mutations on subcontractors/projects invalidate this key
    // via `invalidateAdminEntity` — refetch timers are wasted work.
    staleTime: Infinity,
  });

export type UpsertSubcontractorInput = {
  id?: number;
  displayId: string;
  name: string;
  description: string;
  disciplines: string[];
  projectIds: number[];
};

/** Create or update a subcontractor and its project assignments. Admin-only. */
export const upsertSubcontractor = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertSubcontractor)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const base = {
        displayId: data.displayId,
        name: data.name,
        description: data.description,
        disciplines: data.disciplines,
      };
      const projectRefs = data.projectIds.map((id) => ({ id }));
      if (data.id) {
        // Update: `set` replaces the relation list with exactly these projects.
        await prisma.subcontractor.update({
          where: { id: data.id },
          data: { ...base, projects: { set: projectRefs } },
        });
      } else {
        // Create: a new row has no prior relations, so use `connect`.
        await prisma.subcontractor.create({
          data: { ...base, projects: { connect: projectRefs } },
        });
      }
      return { ok: true };
    }),
  );

export const deleteSubcontractor = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.subcontractor.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

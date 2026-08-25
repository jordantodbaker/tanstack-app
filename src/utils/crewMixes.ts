import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, adminHandlerNoInput } from "./users.server";
import { parseIdInput, parseUpsertCrewMix } from "~/lib/validators";

/**
 * Crew Mix data for the Take Off sheet's "Use Crew Mix" mode. A crew mix is a
 * set of roles plus one schedule; the cell renderer combines `roleNames` +
 * `schedule` with `meta.roleRates` (see `crewMixAverageRate`) to compute the
 * row's labor rate. Cached indefinitely; admin mutations invalidate via
 * `invalidateAdminEntity`.
 */
export type CrewMixData = {
  id: number;
  name: string;
  schedule: string;
  members: { roleName: string; count: number }[];
}[];

export const fetchCrewMixData = createServerFn({ method: "GET" }).handler(
  async (): Promise<CrewMixData> => {
    const rows = await prisma.crewMix.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        schedule: true,
        members: {
          select: { count: true, role: { select: { name: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      schedule: r.schedule,
      members: r.members.map((m) => ({ roleName: m.role.name, count: m.count })),
    }));
  },
);

export const crewMixDataQueryOptions = () =>
  queryOptions({
    queryKey: qk.crewMixes.data(),
    queryFn: () => fetchCrewMixData(),
    staleTime: Infinity,
  });

/**
 * Admin-side crew mix item: identity + description + schedule + member roles
 * (both ids, for the form, and names, for display / rate preview).
 */
export type CrewMixAdminItem = {
  id: number;
  name: string;
  description: string;
  schedule: string;
  members: { roleId: number; roleName: string; count: number }[];
};

export const fetchCrewMixesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<CrewMixAdminItem[]> => {
    const rows = await prisma.crewMix.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        schedule: true,
        members: {
          select: { roleId: true, count: true, role: { select: { name: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      schedule: r.schedule,
      members: r.members.map((m) => ({
        roleId: m.roleId,
        roleName: m.role.name,
        count: m.count,
      })),
    }));
  }),
);

export const crewMixesAdminQueryOptions = () =>
  queryOptions({
    queryKey: qk.crewMixes.admin(),
    queryFn: () => fetchCrewMixesAdmin(),
    staleTime: Infinity,
  });

export type UpsertCrewMixInput = {
  id?: number;
  name: string;
  description: string;
  schedule: string;
  members: { roleId: number; count: number }[];
};

/**
 * Collapse duplicate roles into one row per role, summing their counts, and
 * drop non-positive counts. Keeps one row per (mix, role) as the schema's
 * `@@unique([crewMixId, roleId])` requires, while letting the dialog express
 * "multiple of the same role" as a count.
 */
function normalizeMembers(
  members: { roleId: number; count: number }[],
): { roleId: number; count: number }[] {
  const byRole = new Map<number, number>();
  for (const m of members) {
    if (!(m.count > 0)) continue;
    byRole.set(m.roleId, (byRole.get(m.roleId) ?? 0) + m.count);
  }
  return Array.from(byRole, ([roleId, count]) => ({ roleId, count }));
}

/**
 * Create or update a crew mix. Members (roles + counts) are replaced wholesale
 * — the dialog sends the full set every time. Admin-only.
 */
export const upsertCrewMix = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertCrewMix)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const name = data.name.trim();
      const description = data.description.trim();
      const schedule = data.schedule.trim();
      const members = normalizeMembers(data.members);

      await prisma.$transaction(async (tx) => {
        if (data.id) {
          await tx.crewMix.update({
            where: { id: data.id },
            data: { name, description, schedule },
          });
          await tx.crewMixMember.deleteMany({ where: { crewMixId: data.id } });
          if (members.length > 0) {
            await tx.crewMixMember.createMany({
              data: members.map((m) => ({ crewMixId: data.id!, ...m })),
            });
          }
        } else {
          await tx.crewMix.create({
            data: { name, description, schedule, members: { create: members } },
          });
        }
      });

      return { ok: true };
    }),
  );

/** Delete a crew mix. Cascades to its members. Admin-only. */
export const deleteCrewMix = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.crewMix.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

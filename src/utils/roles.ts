import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { adminHandler, adminHandlerNoInput } from "./users.server";
import { parseIdInput, parseUpsertRole } from "~/lib/validators";

/** `disciplineId` is a string id or null (return everything). */
const DisciplineIdOrNull = z.string().nullable();

export type RoleData = {
  roleOptions: string[];
  scheduleOptions: string[];
  roleRates: { roleName: string; schedule: string; rate: number }[];
};

/**
 * Role data for a discipline's Take Off sheet. `disciplineId` filters the
 * Role dropdown so only roles whose `disciplines` array contains it appear;
 * pass `null` to return every role (used by callers that haven't been
 * scoped yet, but production callers should always pass a discipline).
 */
export const fetchRoleData = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => DisciplineIdOrNull.parse(input))
  .handler(async ({ data: disciplineId }): Promise<RoleData> => {
    const roleWhere =
      disciplineId === null ? {} : { disciplines: { has: disciplineId } };
    const [roles, rates] = await Promise.all([
      prisma.role.findMany({
        where: roleWhere,
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.roleRate.findMany({
        where: disciplineId === null ? {} : { role: roleWhere },
        include: { role: { select: { name: true } } },
        orderBy: [{ role: { name: "asc" } }, { schedule: "asc" }],
      }),
    ]);
    const scheduleSet = new Set<string>();
    for (const r of rates) scheduleSet.add(r.schedule);
    return {
      roleOptions: roles.map((r) => r.name),
      scheduleOptions: Array.from(scheduleSet).sort(),
      roleRates: rates.map((r) => ({
        roleName: r.role.name,
        schedule: r.schedule,
        rate: r.rate,
      })),
    };
  });

export const roleDataQueryOptions = (disciplineId: string | null = null) =>
  queryOptions({
    queryKey: ["roleData", disciplineId],
    queryFn: () => fetchRoleData({ data: disciplineId }),
    staleTime: Infinity,
  });

/** Admin-side role row: full identity plus the discipline assignments. */
export type RoleAdminItem = {
  id: number;
  name: string;
  disciplines: string[];
  rateCount: number;
};

export const fetchRolesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<RoleAdminItem[]> => {
    const rows = await prisma.role.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        disciplines: true,
        _count: { select: { rates: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      disciplines: r.disciplines,
      rateCount: r._count.rates,
    }));
  }),
);

export const rolesAdminQueryOptions = () =>
  queryOptions({
    queryKey: ["rolesAdmin"],
    queryFn: () => fetchRolesAdmin(),
    // Admin role mutations invalidate this key via `invalidateAdminEntity`.
    staleTime: Infinity,
  });

export type UpsertRoleInput = {
  id?: number;
  name: string;
  disciplines: string[];
};

/** Create or update a construction discipline role. Admin-only. */
export const upsertRole = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertRole)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const payload = {
        name: data.name.trim(),
        disciplines: data.disciplines,
      };
      if (data.id) {
        await prisma.role.update({ where: { id: data.id }, data: payload });
      } else {
        await prisma.role.create({ data: payload });
      }
      return { ok: true };
    }),
  );

/** Delete a role. Cascades to its `RoleRate` rows. Admin-only. */
export const deleteRole = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.role.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

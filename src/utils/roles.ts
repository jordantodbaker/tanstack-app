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

/** One labor-rate row attached to a Role (admin payload + upsert input). */
export type RoleRateAdmin = {
  schedule: string;
  rate: number;
};

/** Admin-side role row: full identity, discipline assignments, and the full
 *  rate set (so the dialog can render the table without a second fetch). */
export type RoleAdminItem = {
  id: number;
  name: string;
  disciplines: string[];
  rates: RoleRateAdmin[];
  /** Denormalized for the list-view "Rates" column; matches `rates.length`. */
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
        rates: {
          select: { schedule: true, rate: true },
          orderBy: { schedule: "asc" },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      disciplines: r.disciplines,
      rates: r.rates,
      rateCount: r.rates.length,
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
  rates: RoleRateAdmin[];
};

/**
 * Create or update a construction discipline role. Admin-only.
 *
 * Updates atomically replace the role's full rate set inside a transaction
 * — the simpler delete-then-recreate is safe here because there's no
 * foreign-key inbound to `RoleRate.id` (Take Off rows store the schedule
 * label by value, not by id, so an id churn is invisible to consumers).
 */
export const upsertRole = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertRole)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const name = data.name.trim();
      const ratesData = data.rates.map((r) => ({
        schedule: r.schedule.trim(),
        rate: r.rate,
      }));
      if (data.id) {
        const id = data.id;
        await prisma.$transaction([
          prisma.role.update({
            where: { id },
            data: { name, disciplines: data.disciplines },
          }),
          prisma.roleRate.deleteMany({ where: { roleId: id } }),
          prisma.roleRate.createMany({
            data: ratesData.map((r) => ({ ...r, roleId: id })),
          }),
        ]);
      } else {
        await prisma.role.create({
          data: {
            name,
            disciplines: data.disciplines,
            rates: { createMany: { data: ratesData } },
          },
        });
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

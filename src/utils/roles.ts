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
    const [roles, rates, schedules] = await Promise.all([
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
      // Schedule dropdown options come from the managed Schedule list (ordered),
      // not the distinct set of rate rows — so a schedule with no rate yet still
      // appears, and the ordering is admin-controlled.
      prisma.schedule.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: { name: true },
      }),
    ]);
    return {
      roleOptions: roles.map((r) => r.name),
      scheduleOptions: schedules.map((s) => s.name),
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

/**
 * Admin-side role row: identity, discipline assignments, and the full
 * per-schedule rate rows (so the dialog can pre-fill a rate box per schedule).
 */
export type RoleAdminItem = {
  id: number;
  name: string;
  disciplines: string[];
  rates: { schedule: string; rate: number }[];
};

export const fetchRolesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<RoleAdminItem[]> => {
    return prisma.role.findMany({
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
  rates: { schedule: string; rate: number }[];
};

/**
 * Create or update a construction discipline role, including its per-schedule
 * labor rates. Rates are replaced wholesale — the dialog sends the full set
 * every time — mirroring how `upsertCrewMix` handles members. Blank/invalid
 * rate rows are dropped so a schedule left empty in the dialog simply has no
 * RoleRate. Admin-only.
 */
export const upsertRole = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertRole)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const name = data.name.trim();
      const cleanRates = data.rates
        .map((r) => ({ schedule: r.schedule.trim(), rate: Number(r.rate) }))
        .filter((r) => r.schedule !== "" && Number.isFinite(r.rate));

      await prisma.$transaction(async (tx) => {
        if (data.id) {
          await tx.role.update({
            where: { id: data.id },
            data: { name, disciplines: data.disciplines },
          });
          await tx.roleRate.deleteMany({ where: { roleId: data.id } });
          if (cleanRates.length > 0) {
            await tx.roleRate.createMany({
              data: cleanRates.map((r) => ({
                roleId: data.id!,
                schedule: r.schedule,
                rate: r.rate,
              })),
            });
          }
        } else {
          await tx.role.create({
            data: {
              name,
              disciplines: data.disciplines,
              rates: { createMany: { data: cleanRates } },
            },
          });
        }
      });
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

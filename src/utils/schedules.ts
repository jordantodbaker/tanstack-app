import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler } from "./users.server";
import { parseIdInput, parseUpsertSchedule } from "~/lib/validators";

/**
 * Managed labor schedules (the crew/shift codes like "1x6x10"). This is the
 * canonical list the Role rate editor and the Crew Mix schedule picker read
 * from. The name is also stored as a plain string on RoleRate / CrewMix /
 * FefRow, so this table only governs which names are valid and their order.
 */
export type ScheduleItem = { id: number; name: string; position: number };

export const fetchSchedules = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScheduleItem[]> => {
    return prisma.schedule.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, position: true },
    });
  },
);

export const schedulesQueryOptions = () =>
  queryOptions({
    queryKey: qk.schedules(),
    queryFn: () => fetchSchedules(),
    staleTime: Infinity,
  });

export type UpsertScheduleInput = {
  id?: number;
  name: string;
  position?: number;
};

/**
 * Create or rename a schedule. A rename cascades the new name onto the string
 * references (RoleRate.schedule, CrewMix.schedule) so existing rates and crew
 * mixes keep matching; FefRow.schedule is intentionally left as a snapshot,
 * mirroring how a role rename leaves stale Take Off values. Admin-only.
 */
export const upsertSchedule = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertSchedule)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const name = data.name.trim();
      await prisma.$transaction(async (tx) => {
        if (data.id) {
          const existing = await tx.schedule.findUnique({
            where: { id: data.id },
          });
          if (existing && existing.name !== name) {
            await tx.roleRate.updateMany({
              where: { schedule: existing.name },
              data: { schedule: name },
            });
            await tx.crewMix.updateMany({
              where: { schedule: existing.name },
              data: { schedule: name },
            });
          }
          await tx.schedule.update({
            where: { id: data.id },
            data: {
              name,
              ...(data.position !== undefined
                ? { position: data.position }
                : {}),
            },
          });
        } else {
          // New schedules sort to the end unless a position is supplied.
          const count = await tx.schedule.count();
          await tx.schedule.create({
            data: { name, position: data.position ?? count },
          });
        }
      });
      return { ok: true };
    }),
  );

/**
 * Delete a schedule. Drops every RoleRate keyed on it (they're meaningless
 * without the schedule) and clears it off any crew mix that pointed at it.
 * FefRow.schedule is left as a stale snapshot. Admin-only.
 */
export const deleteSchedule = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.$transaction(async (tx) => {
        const sched = await tx.schedule.findUnique({ where: { id: data.id } });
        if (!sched) return;
        await tx.roleRate.deleteMany({ where: { schedule: sched.name } });
        await tx.crewMix.updateMany({
          where: { schedule: sched.name },
          data: { schedule: "" },
        });
        await tx.schedule.delete({ where: { id: data.id } });
      });
      return { ok: true };
    }),
  );

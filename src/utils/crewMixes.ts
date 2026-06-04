import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, adminHandlerNoInput } from "./users.server";
import { parseIdInput, parseUpsertCrewMix } from "~/lib/validators";

/**
 * Crew Mix data for the Take Off sheet's "Use Crew Mix" mode. Returns every
 * crew mix's id + name + members so the cell renderer can both populate the
 * dropdown and compute the average wage for the selected mix. Cached
 * indefinitely; admin mutations invalidate via `invalidateAdminEntity`.
 */
export type CrewMixData = {
  id: number;
  name: string;
  members: { jobTitle: string; wage: number }[];
}[];

export const fetchCrewMixData = createServerFn({ method: "GET" }).handler(
  async (): Promise<CrewMixData> => {
    const rows = await prisma.crewMix.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        members: {
          select: { jobTitle: true, wage: true },
          orderBy: { id: "asc" },
        },
      },
    });
    return rows;
  },
);

export const crewMixDataQueryOptions = () =>
  queryOptions({
    queryKey: ["crewMixData"],
    queryFn: () => fetchCrewMixData(),
    staleTime: Infinity,
  });

/** Average of a crew mix's member wages. Returns 0 when the mix has no members. */
export function crewMixAverageWage(
  members: { wage: number }[],
): number {
  if (members.length === 0) return 0;
  const sum = members.reduce((acc, m) => acc + m.wage, 0);
  return sum / members.length;
}

/** Admin-side crew mix item: id + name + description + members. */
export type CrewMixAdminItem = {
  id: number;
  name: string;
  description: string;
  members: { jobTitle: string; wage: number }[];
};

export const fetchCrewMixesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<CrewMixAdminItem[]> => {
    const rows = await prisma.crewMix.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        members: {
          select: { jobTitle: true, wage: true },
          orderBy: { id: "asc" },
        },
      },
    });
    return rows;
  }),
);

export const crewMixesAdminQueryOptions = () =>
  queryOptions({
    queryKey: ["crewMixesAdmin"],
    queryFn: () => fetchCrewMixesAdmin(),
    staleTime: Infinity,
  });

export type UpsertCrewMixInput = {
  id?: number;
  name: string;
  description: string;
  members: { jobTitle: string; wage: number }[];
};

/**
 * Create or update a crew mix. Members are replaced wholesale — the dialog
 * sends the full member list every time, so on edit we drop the old set and
 * re-insert. Admin-only.
 */
export const upsertCrewMix = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertCrewMix)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const name = data.name.trim();
      const description = data.description.trim();
      const cleanMembers = data.members
        .map((m) => ({ jobTitle: m.jobTitle.trim(), wage: Number(m.wage) }))
        .filter((m) => m.jobTitle !== "" && Number.isFinite(m.wage));

      await prisma.$transaction(async (tx) => {
        if (data.id) {
          await tx.crewMix.update({
            where: { id: data.id },
            data: { name, description },
          });
          await tx.crewMixMember.deleteMany({
            where: { crewMixId: data.id },
          });
          if (cleanMembers.length > 0) {
            await tx.crewMixMember.createMany({
              data: cleanMembers.map((m) => ({
                crewMixId: data.id!,
                jobTitle: m.jobTitle,
                wage: m.wage,
              })),
            });
          }
        } else {
          await tx.crewMix.create({
            data: {
              name,
              description,
              members: { create: cleanMembers },
            },
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

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export type RoleData = {
  roleOptions: string[];
  scheduleOptions: string[];
  roleRates: { roleName: string; schedule: string; rate: number }[];
};

export const fetchRoleData = createServerFn({ method: "GET" }).handler(
  async (): Promise<RoleData> => {
    const [roles, rates] = await Promise.all([
      prisma.role.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.roleRate.findMany({
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
  },
);

export const roleDataQueryOptions = () =>
  queryOptions({
    queryKey: ["roleData"],
    queryFn: () => fetchRoleData(),
    staleTime: Infinity,
  });

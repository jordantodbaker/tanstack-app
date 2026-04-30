import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchRoleOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const roles = await prisma.role.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return roles.map((r) => r.name);
  },
);

export const fetchScheduleOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const rows = await prisma.roleRate.findMany({
      select: { schedule: true },
      distinct: ["schedule"],
      orderBy: { schedule: "asc" },
    });
    return rows.map((r) => r.schedule);
  },
);

export const fetchRoleRates = createServerFn({ method: "GET" }).handler(
  async () => {
    const rows = await prisma.roleRate.findMany({
      include: { role: { select: { name: true } } },
      orderBy: [{ role: { name: "asc" } }, { schedule: "asc" }],
    });
    return rows.map((r) => ({
      roleName: r.role.name,
      schedule: r.schedule,
      rate: r.rate,
    }));
  },
);

import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchPipingGroups = createServerFn({ method: "GET" }).handler(() => {
  return prisma.pipingGroup.findMany({
    include: { values: { orderBy: { size: "asc" } } },
    orderBy: { groupNo: "asc" },
  });
});

export const fetchPipingFactorCodes = createServerFn({ method: "GET" }).handler(
  async () => {
    const rows = await prisma.pipingFactor.findMany({
      select: { code: true },
      distinct: ["code"],
      orderBy: { code: "asc" },
    });
    return rows.map((r) => r.code);
  },
);

export const fetchPipingFactors = createServerFn({ method: "GET" }).handler(
  () => {
    return prisma.pipingFactor.findMany({
      select: {
        code: true,
        unit: true,
        values: { select: { size: true, value: true } },
      },
    });
  },
);

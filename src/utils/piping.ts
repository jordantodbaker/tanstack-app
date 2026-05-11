import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchPipingGroups = createServerFn({ method: "GET" }).handler(() => {
  return prisma.pipingGroup.findMany({
    include: { values: { orderBy: { size: "asc" } } },
    orderBy: { groupNo: "asc" },
  });
});

export const pipingGroupsQueryOptions = () =>
  queryOptions({
    queryKey: ["pipingGroups"],
    queryFn: () => fetchPipingGroups(),
    staleTime: Infinity,
  });

export type PipingFactorData = {
  taskCodeOptions: { code: string; taskDefinition: string }[];
  pipingFactors: {
    code: string;
    unit: string;
    values: { size: number; value: number | null }[];
  }[];
};

export const fetchPipingFactorData = createServerFn({ method: "GET" }).handler(
  async (): Promise<PipingFactorData> => {
    const factors = await prisma.pipingFactor.findMany({
      select: {
        code: true,
        unit: true,
        taskDefinition: true,
        values: { select: { size: true, value: true } },
      },
      orderBy: { code: "asc" },
    });
    const taskCodeMap = new Map<string, string>();
    for (const f of factors) {
      if (!taskCodeMap.has(f.code)) taskCodeMap.set(f.code, f.taskDefinition);
    }
    return {
      taskCodeOptions: Array.from(taskCodeMap, ([code, taskDefinition]) => ({
        code,
        taskDefinition,
      })),
      pipingFactors: factors.map((f) => ({
        code: f.code,
        unit: f.unit,
        values: f.values,
      })),
    };
  },
);

export const pipingFactorDataQueryOptions = () =>
  queryOptions({
    queryKey: ["pipingFactorData"],
    queryFn: () => fetchPipingFactorData(),
    staleTime: Infinity,
  });

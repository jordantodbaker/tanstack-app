import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
} from "../lib/project-totals";

export type { ProjectFefRowTotals } from "../lib/project-totals";

const EMPTY_TOTALS: ProjectFefRowTotals = {
  laborByDigit: {},
  laborHoursByDigit: {},
  quantityByDigit: {},
  craftSupportLabor: 0,
  craftSupportLaborHours: 0,
  materialsByDigit: {},
};

export const fetchProjectFefRowTotals = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<ProjectFefRowTotals> => {
    const rows = await prisma.fefRow.findMany({
      where: { projectId },
      select: {
        discipline: true,
        section: true,
        cbsCode: true,
        quantity: true,
        laborHours: true,
        laborRate: true,
        materialCost: true,
      },
    });
    return accumulateProjectTotals(rows);
  });

export const projectFefRowTotalsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["projectFefRowTotals", projectId],
    queryFn: (): Promise<ProjectFefRowTotals> =>
      projectId === null
        ? Promise.resolve(EMPTY_TOTALS)
        : fetchProjectFefRowTotals({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

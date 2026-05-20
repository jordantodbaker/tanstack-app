import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";
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
  byArea: [],
  invalidByDiscipline: {},
};

export const fetchProjectFefRowTotals = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<ProjectFefRowTotals> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.fefRow.findMany({
      where: { projectId },
      // All FEF free-text fields are selected: the Take Off invalid check
      // treats *any* non-empty field as "user touched this row", so any one
      // of these missing on the server side would silently under-count.
      select: {
        discipline: true,
        section: true,
        cbsCode: true,
        area: true,
        name: true,
        description: true,
        shopField: true,
        weldGroupDescription: true,
        quantity: true,
        size: true,
        unit: true,
        metallurgyCode: true,
        boreSize: true,
        role: true,
        schedule: true,
        taskCode: true,
        laborHours: true,
        laborRate: true,
        materialCost: true,
        equipment: true,
        notes: true,
        sub: true,
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
    // Saves invalidate this query key, so refetching on a timer is wasted work.
    staleTime: Infinity,
  });

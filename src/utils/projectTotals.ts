import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
} from "../lib/project-totals";
import { FEF_ROW_STRING_FIELDS } from "../lib/fef-helpers";
import { qk } from "../lib/query-keys";
import { parseProjectIdInput } from "../lib/validators";

export type { ProjectFefRowTotals } from "../lib/project-totals";

const EMPTY_TOTALS: ProjectFefRowTotals = {
  laborByDigit: {},
  laborHoursByDigit: {},
  quantityByDigit: {},
  craftSupportLabor: 0,
  craftSupportLaborHours: 0,
  materialsByDigit: {},
  laborByL1: {},
  laborHoursByL1: {},
  quantityByL1: {},
  materialsByL1: {},
  byArea: [],
  invalidByDiscipline: {},
};

export const fetchProjectFefRowTotals = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
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
        crewMixId: true,
        schedule: true,
        taskCode: true,
        laborHours: true,
        laborFactor: true,
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
    queryKey: qk.projectFefRowTotals(projectId),
    queryFn: (): Promise<ProjectFefRowTotals> =>
      projectId === null
        ? Promise.resolve(EMPTY_TOTALS)
        : fetchProjectFefRowTotals({ data: projectId }),
    enabled: projectId !== null,
    // Saves invalidate this query key, so refetching on a timer is wasted work.
    staleTime: Infinity,
  });

/**
 * Cheap "which disciplines have an invalid Take Off row?" lookup for the
 * sidebar warning badge. The full `projectFefRowTotals` payload loads every
 * FefRow for the project across all 22 free-text columns plus iterates them
 * in JS — overkill for the one field the sidebar reads on every page render.
 *
 * Prunes in two layers:
 *   1. SQL `WHERE` keeps only TAKE_OFF rows where the user has touched
 *      *something* (cbsCode or any of the 19 free-text fields non-empty).
 *      Empty template rows never reach the JS pass.
 *   2. SELECT trims the column set to discipline + the two numeric inputs
 *      the not-computable predicate actually evaluates.
 */
export const fetchInvalidByDiscipline = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<Record<string, number>> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.fefRow.findMany({
      where: {
        projectId,
        section: "TAKE_OFF",
        // "touched" — kept in sync with the OR-shaped predicate in
        // `fef-helpers.ts:isTakeOffRowInvalid`. Both the cbsCode column and
        // any of the 19 free-text fields being non-empty counts as touched.
        OR: [
          { cbsCode: { not: "" } },
          ...FEF_ROW_STRING_FIELDS.map((f) => ({ [f]: { not: "" } })),
        ],
      },
      select: { discipline: true, laborHours: true, laborRate: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      // "not computable" half of `isTakeOffRowInvalid` — see comment there.
      const hours = parseFloat(r.laborHours);
      const rate = parseFloat(r.laborRate);
      const canCompute =
        !isNaN(hours) &&
        hours > 0 &&
        !isNaN(rate) &&
        r.laborRate !== "";
      if (!canCompute && r.discipline) {
        out[r.discipline] = (out[r.discipline] ?? 0) + 1;
      }
    }
    return out;
  });

export const invalidByDisciplineQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.invalidByDiscipline(projectId),
    queryFn: (): Promise<Record<string, number>> =>
      projectId === null
        ? Promise.resolve({})
        : fetchInvalidByDiscipline({ data: projectId }),
    enabled: projectId !== null,
    staleTime: Infinity,
  });

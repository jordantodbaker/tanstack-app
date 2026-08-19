import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireVersionAccess } from "./users.server";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
} from "../lib/project-totals";
import {
  FEF_DATA_COLUMNS,
  FEF_ROW_STRING_FIELDS,
  isTotalCostComputable,
} from "../lib/fef-helpers";
import { qk } from "../lib/query-keys";
import { parseIdScalar } from "../lib/validators";

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
  laborByL1L2: {},
  laborHoursByL1L2: {},
  quantityByL1L2: {},
  materialsByL1L2: {},
  byArea: [],
  invalidByDiscipline: {},
};

/**
 * Columns the aggregator reads, derived from `FEF_DATA_COLUMNS` (cbsCode plus
 * every free-text field) rather than listed by hand. The Take Off invalid check
 * treats *any* non-empty field as "the user started this row", so a field
 * missing here silently under-counts — which is exactly what happened while
 * this was a hand-maintained list and the FefRow shape kept growing.
 */
const TOTALS_SELECT = Object.fromEntries([
  ["discipline", true],
  ["section", true],
  ...FEF_DATA_COLUMNS.map((c) => [c, true]),
]) as Record<"discipline" | "section" | (typeof FEF_DATA_COLUMNS)[number], true>;

/**
 * Plain (no-auth) loader: every FefRow for the project → aggregated totals.
 * Module-private and called only by `fetchProjectFefRowTotals`'s handler, so
 * the tanstack-start client transform dead-strips it (and the prisma import)
 * from the browser bundle. **Do not `export` it** — an exported module-scope
 * prisma function survives client stripping and pulls the Node-only Prisma
 * client into the browser (it broke the dashboard once already).
 */
async function loadProjectTotals(
  versionId: number,
): Promise<ProjectFefRowTotals> {
  const rows = await prisma.fefRow.findMany({
    where: { versionId },
    select: TOTALS_SELECT,
  });
  return accumulateProjectTotals(rows);
}

export const fetchProjectFefRowTotals = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data: versionId }): Promise<ProjectFefRowTotals> => {
    await requireVersionAccess(versionId);
    return loadProjectTotals(versionId);
  });

export const projectFefRowTotalsQueryOptions = (versionId: number | null) =>
  queryOptions({
    queryKey: qk.projectFefRowTotals(versionId),
    queryFn: (): Promise<ProjectFefRowTotals> =>
      versionId === null
        ? Promise.resolve(EMPTY_TOTALS)
        : fetchProjectFefRowTotals({ data: versionId }),
    enabled: versionId !== null,
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
  .inputValidator(parseIdScalar)
  .handler(async ({ data: versionId }): Promise<Record<string, number>> => {
    await requireVersionAccess(versionId);
    const rows = await prisma.fefRow.findMany({
      where: {
        versionId,
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
      // The SQL WHERE above covers the "user started this row" half of
      // `isTakeOffRowInvalid`; this is the "Total Cost isn't computable" half.
      if (!isTotalCostComputable(r.laborHours, r.laborRate) && r.discipline) {
        out[r.discipline] = (out[r.discipline] ?? 0) + 1;
      }
    }
    return out;
  });

export const invalidByDisciplineQueryOptions = (versionId: number | null) =>
  queryOptions({
    queryKey: qk.invalidByDiscipline(versionId),
    queryFn: (): Promise<Record<string, number>> =>
      versionId === null
        ? Promise.resolve({})
        : fetchInvalidByDiscipline({ data: versionId }),
    enabled: versionId !== null,
    staleTime: Infinity,
  });

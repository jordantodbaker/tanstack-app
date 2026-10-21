import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireVersionAccess } from "./users.server";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
} from "../lib/project-totals";
import {
  FEF_ROW_STRING_FIELDS,
  isTotalCostComputable,
} from "../lib/fef-helpers";
import { qk } from "../lib/query-keys";
import { parseIdScalar } from "../lib/validators";
import type { Prisma } from "../generated/prisma/client";

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
 * The columns the SUMS read: the bucketing keys and the four numbers. Every
 * other free-text column matters only to the Take Off invalid count, which
 * `loadInvalidByDiscipline` answers in SQL instead — so this read is ~8 of the
 * ~60 FefRow columns, and it is the one Summary / Validation / Snapshots
 * refetch after every autosave.
 */
const TOTALS_SELECT = {
  discipline: true,
  section: true,
  cbsCode: true,
  area: true,
  quantity: true,
  laborHours: true,
  laborRate: true,
  materialCost: true,
} satisfies Prisma.FefRowSelect;

/**
 * Take Off rows per discipline that the user started but whose Total Cost
 * can't be computed — `isTakeOffRowInvalid`, split in two:
 *   1. SQL `WHERE` keeps only TAKE_OFF rows the user has touched (cbsCode or
 *      any free-text field non-empty), so empty template rows never load.
 *   2. JS checks the "not computable" half on just the two inputs it reads.
 * Module-private for the same client-stripping reason as `loadProjectTotals`.
 */
async function loadInvalidByDiscipline(
  versionId: number,
): Promise<Record<string, number>> {
  const rows = await prisma.fefRow.findMany({
    where: {
      versionId,
      section: "TAKE_OFF",
      OR: [
        { cbsCode: { not: "" } },
        ...FEF_ROW_STRING_FIELDS.map((f) => ({ [f]: { not: "" } })),
      ],
    },
    select: { discipline: true, laborHours: true, laborRate: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!isTotalCostComputable(r.laborHours, r.laborRate) && r.discipline) {
      out[r.discipline] = (out[r.discipline] ?? 0) + 1;
    }
  }
  return out;
}

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
  const [rows, invalidByDiscipline] = await Promise.all([
    prisma.fefRow.findMany({ where: { versionId }, select: TOTALS_SELECT }),
    loadInvalidByDiscipline(versionId),
  ]);
  // The slim rows can't tell a started row from an empty one, so the
  // accumulator's own invalid count would under-count; the SQL one replaces it.
  return { ...accumulateProjectTotals(rows), invalidByDiscipline };
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
    return loadInvalidByDiscipline(versionId);
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

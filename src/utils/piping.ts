import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  packPipingFactors,
  type PipingFactorData as PipingFactorDataType,
} from "~/lib/piping-factors";

export const fetchPipingGroups = createServerFn({ method: "GET" }).handler(() => {
  return prisma.pipingGroup.findMany({
    include: { values: { orderBy: { size: "asc" } } },
    orderBy: { groupNo: "asc" },
  });
});

export const pipingGroupsQueryOptions = () =>
  queryOptions({
    queryKey: qk.piping.groups(),
    queryFn: () => fetchPipingGroups(),
    staleTime: Infinity,
  });

export type {
  PackedPipingFactor,
  PipingFactorData,
} from "~/lib/piping-factors";

/**
 * The piping factor catalog, reduced before it is sent.
 *
 * The reduction (drop nulls, one entry per code, flat size/value pairs) is
 * `packPipingFactors`, which is the loop the client used to run on every load
 * — see `~/lib/piping-factors` for why it moved and what it preserves.
 */
export const fetchPipingFactorData = createServerFn({ method: "GET" }).handler(
  async (): Promise<PipingFactorDataType> => {
    const factors = await prisma.pipingFactor.findMany({
      select: {
        code: true,
        unit: true,
        taskDefinition: true,
        values: { select: { size: true, value: true }, orderBy: { size: "asc" } },
      },
      // `id` breaks the tie between two rows sharing a code, so which one wins
      // is at least STABLE rather than left to the planner. Which one *should*
      // win is a separate question — `FBWXXH` exists twice (Sch 5 and XXH)
      // with factors differing up to 3.7x, and the lookup is keyed on `code`
      // alone. Nothing uses that code today; fixing the key is its own change.
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });
    return packPipingFactors(factors);
  },
);

export const pipingFactorDataQueryOptions = () =>
  queryOptions({
    queryKey: qk.piping.factorData(),
    queryFn: () => fetchPipingFactorData(),
    staleTime: Infinity,
  });

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { Id } from "~/lib/validators";

const StringArr = z.array(z.string());
const StringArrParser = (input: unknown) => StringArr.parse(input);

const CbsItemsByL1PagedSchema = z.object({
  l1Values: StringArr,
  page: z.int().nonnegative(),
  pageSize: z.int().positive(),
  projectId: Id.nullable().optional(),
});

const CbsItemsByL1FilteredSchema = z.object({
  l1Values: StringArr,
  projectId: Id.nullable(),
});

export const fetchCbsItems = createServerFn({ method: "GET" }).handler(() => {
  return prisma.cbsItem.findMany({ orderBy: { id: "asc" } });
});

export const fetchCbsItemsByL1 = createServerFn({ method: "GET" })
  .inputValidator(StringArrParser)
  .handler(({ data }) => {
    return prisma.cbsItem.findMany({
      where: { l1: { in: data } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        displayCode: true,
        name: true,
        uom: true,
        displayDescription: true,
        l1: true,
        subReporting: true,
      },
    });
  });

export const cbsItemsByL1QueryOptions = (l1Values: string[]) =>
  queryOptions({
    queryKey: ["cbsItemsByL1", l1Values],
    queryFn: () => fetchCbsItemsByL1({ data: l1Values }),
    staleTime: Infinity,
  });

export const fetchCbsItemsByL1Paged = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => CbsItemsByL1PagedSchema.parse(input))
  .handler(async ({ data }) => {
    const { l1Values, page, pageSize, projectId } = data;
    const where =
      projectId != null
        ? {
            l1: { in: l1Values },
            allowedInProjects: { some: { id: projectId } },
          }
        : { l1: { in: l1Values } };
    const [items, total] = await Promise.all([
      prisma.cbsItem.findMany({
        where,
        orderBy: { id: "asc" },
        skip: page * pageSize,
        take: pageSize,
        select: {
          id: true,
          displayCode: true,
          name: true,
          uom: true,
          displayDescription: true,
        },
      }),
      prisma.cbsItem.count({ where }),
    ]);
    return { items, total };
  });

export const cbsItemsByL1PagedQueryOptions = (input: {
  l1Values: string[];
  page: number;
  pageSize: number;
  projectId: number | null;
}) =>
  queryOptions({
    queryKey: [
      "cbsItemsByL1Paged",
      input.l1Values,
      input.page,
      input.pageSize,
      input.projectId,
    ],
    queryFn: () => fetchCbsItemsByL1Paged({ data: input }),
  });

export const fetchCbsItemsByL1Filtered = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => CbsItemsByL1FilteredSchema.parse(input))
  .handler(({ data }) => {
    const { l1Values, projectId } = data;
    const where =
      projectId != null
        ? {
            l1: { in: l1Values },
            allowedInProjects: { some: { id: projectId } },
          }
        : { l1: { in: l1Values } };
    return prisma.cbsItem.findMany({
      where,
      orderBy: { id: "asc" },
      select: {
        id: true,
        displayCode: true,
        costCode: true,
        name: true,
        uom: true,
        displayDescription: true,
        subReporting: true,
      },
    });
  });

export const cbsItemsByL1FilteredQueryOptions = (input: {
  l1Values: string[];
  projectId: number | null;
}) =>
  queryOptions({
    queryKey: ["cbsItemsByL1Filtered", input.l1Values, input.projectId],
    queryFn: () => fetchCbsItemsByL1Filtered({ data: input }),
    staleTime: Infinity,
  });

export const fetchCbsItemsByL1EndsWith = createServerFn({ method: "GET" })
  .inputValidator(StringArrParser)
  .handler(({ data }) => {
    return prisma.cbsItem.findMany({
      where: { OR: data.map((suffix) => ({ l1: { endsWith: suffix } })) },
      orderBy: { id: "asc" },
      select: {
        id: true,
        displayCode: true,
        name: true,
        uom: true,
        displayDescription: true,
        l1: true,
        accountDescription: true,
      },
    });
  });

export const cbsItemsQueryOptions = () =>
  queryOptions({
    queryKey: ["cbsItems"],
    queryFn: () => fetchCbsItems(),
  });

/**
 * Server-side search over the CBS catalog for the entity-dialog pickers.
 * Capped (`take`) so each keystroke pulls a small page instead of shipping the
 * whole ~5k-row catalog to the client on first dialog open. An empty query
 * returns the first `take` codes so the dropdown isn't blank before the user
 * types. Selected codes render from their stored value, so they don't need to
 * be present in the result page.
 */
const CbsCodeSearchSchema = z.object({
  query: z.string(),
  take: z.int().positive().max(100).optional(),
});
export const searchCbsCodeOptions = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => CbsCodeSearchSchema.parse(input))
  .handler(({ data }) => {
    const q = data.query.trim();
    return prisma.cbsItem.findMany({
      where: q
        ? {
            OR: [
              { displayCode: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { displayCode: "asc" },
      take: data.take ?? 50,
      select: { displayCode: true, name: true },
    });
  });

export const cbsCodeSearchQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ["cbsCodeSearch", query],
    queryFn: () => searchCbsCodeOptions({ data: { query } }),
    // The same query rarely changes mid-session; cache a few minutes. Keep the
    // previous page visible while the next keystroke's query is in flight so
    // the dropdown doesn't flicker empty.
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

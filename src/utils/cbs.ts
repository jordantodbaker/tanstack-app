import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchCbsItems = createServerFn({ method: "GET" }).handler(() => {
  return prisma.cbsItem.findMany({ orderBy: { id: "asc" } });
});

export const fetchCbsItemsByL1 = createServerFn({ method: "GET" })
  .inputValidator((l1Values: string[]) => l1Values)
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
  .inputValidator(
    (input: {
      l1Values: string[];
      page: number;
      pageSize: number;
      projectId?: number | null;
    }) => input,
  )
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
  .inputValidator(
    (input: { l1Values: string[]; projectId: number | null }) => input,
  )
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
  .inputValidator((suffixes: string[]) => suffixes)
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

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
    });
  });

export const fetchCbsItemsByL1Paged = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { l1Values: string[]; page: number; pageSize: number }) => input,
  )
  .handler(async ({ data }) => {
    const { l1Values, page, pageSize } = data;
    const where = { l1: { in: l1Values } };
    const [items, total] = await Promise.all([
      prisma.cbsItem.findMany({
        where,
        orderBy: { id: "asc" },
        skip: page * pageSize,
        take: pageSize,
        select: {
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

export const fetchCbsItemsByL1EndsWith = createServerFn({ method: "GET" })
  .inputValidator((suffix: string) => suffix)
  .handler(({ data }) => {
    return prisma.cbsItem.findMany({
      where: { l1: { endsWith: data } },
      orderBy: { id: "asc" },
      select: {
        displayCode: true,
        name: true,
        uom: true,
        displayDescription: true,
      },
    });
  });

export const cbsItemsQueryOptions = () =>
  queryOptions({
    queryKey: ["cbsItems"],
    queryFn: () => fetchCbsItems(),
  });

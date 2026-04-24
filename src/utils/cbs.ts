import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchCbsItems = createServerFn({ method: "GET" }).handler(() => {
  return prisma.cbsItem.findMany({ orderBy: { id: "asc" } });
});

export const cbsItemsQueryOptions = () =>
  queryOptions({
    queryKey: ["cbsItems"],
    queryFn: () => fetchCbsItems(),
  });

import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export const fetchPipingGroups = createServerFn({ method: "GET" }).handler(() => {
  return prisma.pipingGroup.findMany({
    include: { values: { orderBy: { size: "asc" } } },
    orderBy: { groupNo: "asc" },
  });
});

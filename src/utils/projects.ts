import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export type ProjectOption = {
  id: number;
  displayId: string;
  name: string;
};

export const fetchProjects = createServerFn({ method: "GET" }).handler(
  () =>
    prisma.project.findMany({
      orderBy: { id: "asc" },
      select: { id: true, displayId: true, name: true },
    }),
);

export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

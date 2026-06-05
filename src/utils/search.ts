import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import { parseSearchInput } from "~/lib/validators";
import { requireProjectAccess } from "./users.server";

/**
 * Cross-entity command-palette search. Searches the five change-pipeline
 * entities (CVR / FCO / RFI / PCO / Trend) for the selected project and
 * returns a flat, unified result list the palette groups by `entity`.
 *
 * Scope is intentionally one project — the whole app is single-project-at-a-
 * time — so the handler reuses `requireProjectAccess`. Matching is Postgres
 * ILIKE (`contains` + `mode: "insensitive"`) over each entity's scalar text
 * columns. `cbsCodes` / `drawingRefs` are scalar lists Prisma can't partial-
 * match, so they're excluded here; the page-level filter still matches them
 * once the user lands on the list route.
 */

export type SearchResultEntity = "cvr" | "fco" | "rfi" | "pco" | "trend";

export type SearchResult = {
  entity: SearchResultEntity;
  id: number;
  /** Human number (cvrNumber/fcoNumber/…), or "" when unset. */
  number: string;
  /** title, or subject for RFIs. */
  title: string;
  /** Entity status enum as a string; the palette casts per entity for the badge. */
  status: string;
  /** Discipline id, or "" (PCOs have no discipline). */
  discipline: string;
  /** List route this result navigates to. */
  route: string;
  /** What to seed the destination page's search box with — number, or title
   *  when the record has no number yet. Filters the list down to this row. */
  filterQuery: string;
};

/** Per-entity number-or-title fallback for the destination page's `?q`. */
const filterQueryFor = (number: string, title: string): string =>
  number !== "" ? number : title;

// ── Pure row → SearchResult mappers (exported for unit testing) ──────────────

export const mapCvrResult = (r: {
  id: number;
  cvrNumber: string;
  title: string;
  status: string;
  discipline: string;
}): SearchResult => ({
  entity: "cvr",
  id: r.id,
  number: r.cvrNumber,
  title: r.title,
  status: r.status,
  discipline: r.discipline,
  route: "/changelog",
  filterQuery: filterQueryFor(r.cvrNumber, r.title),
});

export const mapFcoResult = (r: {
  id: number;
  fcoNumber: string;
  title: string;
  status: string;
  discipline: string;
}): SearchResult => ({
  entity: "fco",
  id: r.id,
  number: r.fcoNumber,
  title: r.title,
  status: r.status,
  discipline: r.discipline,
  route: "/fco-log",
  filterQuery: filterQueryFor(r.fcoNumber, r.title),
});

export const mapRfiResult = (r: {
  id: number;
  rfiNumber: string;
  subject: string;
  status: string;
  discipline: string;
}): SearchResult => ({
  entity: "rfi",
  id: r.id,
  number: r.rfiNumber,
  title: r.subject,
  status: r.status,
  discipline: r.discipline,
  route: "/rfis",
  filterQuery: filterQueryFor(r.rfiNumber, r.subject),
});

export const mapPcoResult = (r: {
  id: number;
  pcoNumber: string;
  title: string;
  status: string;
}): SearchResult => ({
  entity: "pco",
  id: r.id,
  number: r.pcoNumber,
  title: r.title,
  status: r.status,
  // PCOs carry no discipline column.
  discipline: "",
  route: "/pco",
  filterQuery: filterQueryFor(r.pcoNumber, r.title),
});

export const mapTrendResult = (r: {
  id: number;
  trendNumber: string;
  title: string;
  status: string;
  discipline: string;
}): SearchResult => ({
  entity: "trend",
  id: r.id,
  number: r.trendNumber,
  title: r.title,
  status: r.status,
  discipline: r.discipline,
  route: "/trends",
  filterQuery: filterQueryFor(r.trendNumber, r.title),
});

/** Per-entity row cap — keeps the palette tight and the query cheap. */
const TAKE_PER_ENTITY = 6;

export const searchProject = createServerFn({ method: "GET" })
  .inputValidator(parseSearchInput)
  .handler(async ({ data }): Promise<SearchResult[]> => {
    const { projectId, query } = data;
    await requireProjectAccess(projectId);

    const ilike = { contains: query, mode: "insensitive" as const };
    const orderBy = { updatedAt: "desc" as const };

    const [cvrs, fcos, rfis, pcos, trends] = await Promise.all([
      prisma.changeLog.findMany({
        where: {
          projectId,
          OR: [
            { cvrNumber: ilike },
            { title: ilike },
            { description: ilike },
            { notes: ilike },
          ],
        },
        select: {
          id: true,
          cvrNumber: true,
          title: true,
          status: true,
          discipline: true,
        },
        orderBy,
        take: TAKE_PER_ENTITY,
      }),
      prisma.fieldChangeOrder.findMany({
        where: {
          projectId,
          OR: [
            { fcoNumber: ilike },
            { title: ilike },
            { description: ilike },
            { reasonNarrative: ilike },
            { notes: ilike },
          ],
        },
        select: {
          id: true,
          fcoNumber: true,
          title: true,
          status: true,
          discipline: true,
        },
        orderBy,
        take: TAKE_PER_ENTITY,
      }),
      prisma.rfi.findMany({
        where: {
          projectId,
          OR: [
            { rfiNumber: ilike },
            { subject: ilike },
            { question: ilike },
          ],
        },
        select: {
          id: true,
          rfiNumber: true,
          subject: true,
          status: true,
          discipline: true,
        },
        orderBy,
        take: TAKE_PER_ENTITY,
      }),
      prisma.pco.findMany({
        where: {
          projectId,
          OR: [
            { pcoNumber: ilike },
            { ownerReference: ilike },
            { title: ilike },
            { description: ilike },
          ],
        },
        select: {
          id: true,
          pcoNumber: true,
          title: true,
          status: true,
        },
        orderBy,
        take: TAKE_PER_ENTITY,
      }),
      prisma.trend.findMany({
        where: {
          projectId,
          OR: [
            { trendNumber: ilike },
            { title: ilike },
            { description: ilike },
            { reasonNarrative: ilike },
          ],
        },
        select: {
          id: true,
          trendNumber: true,
          title: true,
          status: true,
          discipline: true,
        },
        orderBy,
        take: TAKE_PER_ENTITY,
      }),
    ]);

    return [
      ...cvrs.map(mapCvrResult),
      ...fcos.map(mapFcoResult),
      ...rfis.map(mapRfiResult),
      ...pcos.map(mapPcoResult),
      ...trends.map(mapTrendResult),
    ];
  });

export const searchQueryOptions = (projectId: number | null, query: string) =>
  queryOptions({
    queryKey: qk.search(projectId, query),
    queryFn: (): Promise<SearchResult[]> =>
      projectId === null
        ? Promise.resolve([])
        : searchProject({ data: { projectId, query } }),
    enabled: projectId !== null && query.trim().length >= 2,
    staleTime: 10 * 1000,
  });

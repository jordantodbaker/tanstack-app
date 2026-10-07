import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../server/db";
import { z } from "zod";
import { Id, parseProjectIdInput } from "~/lib/validators";
import {
  adminHandlerNoInput,
  projectIdScopedHandler,
} from "./users.server";

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

/**
 * Resolve pasted CBS codes against the WHOLE catalog (not one discipline's
 * subset) so Excel paste can accept codes from any discipline. Matches each
 * input against a normalized display code OR cost code — hyphens and spaces
 * stripped, case-insensitive — so "601-C0-0000-00-M", "601C0000000M", and
 * lowercased variants all resolve. Returns only the matched items.
 */
export const resolveCbsCodes = createServerFn({ method: "GET" })
  .inputValidator(StringArrParser)
  .handler(async ({ data }) => {
    const normalized = [
      ...new Set(
        data
          .map((c) => c.replace(/[-\s]/g, "").toLowerCase())
          .filter((c) => c !== ""),
      ),
    ];
    if (normalized.length === 0) return [];
    const list = Prisma.join(normalized);
    return prisma.$queryRaw<
      { displayCode: string; costCode: string; name: string; uom: string }[]
    >(Prisma.sql`
      SELECT "displayCode", "costCode", "name", "uom"
      FROM "CbsItem"
      WHERE lower(regexp_replace("displayCode", '[- ]', '', 'g')) IN (${list})
         OR lower(regexp_replace("costCode", '[- ]', '', 'g')) IN (${list})
    `);
  });

export const cbsCodeResolveQueryOptions = (codes: string[]) =>
  queryOptions({
    // Sort so the cache key is order-independent.
    queryKey: qk.cbs.codeResolve(codes),
    queryFn: () =>
      codes.length === 0
        ? Promise.resolve(
            [] as {
              displayCode: string;
              costCode: string;
              name: string;
              uom: string;
            }[],
          )
        : resolveCbsCodes({ data: codes }),
    enabled: codes.length > 0,
    staleTime: 5 * 60 * 1000,
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
        costCode: true,
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
    queryKey: qk.cbs.itemsByL1(l1Values),
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
    queryKey: qk.cbs.itemsByL1Paged(input),
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
    queryKey: qk.cbs.itemsByL1Filtered(input),
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

/**
 * The columns a `CbsItem` row needs to be placed and rendered in the CBS tree
 * (`CbsTreeItem` in ~/lib/cbs-tree). Shared by every tree query so they stay
 * aligned with the tree's type.
 *
 * Deliberately lean: these payloads run to thousands of rows, and the detail
 * panel fetches the full column set for the one row it shows
 * (`fetchCbsItemDetail`). Add a column here only if the TREE needs it —
 * `l2Description` used to ride along unread and cost ~330 KB a load.
 */
export const cbsTreeRowSelect = {
  id: true,
  l1: true,
  l2: true,
  l3: true,
  l4: true,
  l5: true,
  l6: true,
  displayCode: true,
  name: true,
  uom: true,
  accountDescription: true,
  rowType: true,
  // The workbook's Sub Code / Material Code flags — the Code Book badges a row
  // by what it carries, since that section lists no generated rows.
  subReporting: true,
  materialCode: true,
} satisfies Prisma.CbsItemSelect;

/** One row as the CBS tree views receive it. */
export type CbsTreeRow = Prisma.CbsItemGetPayload<{
  select: typeof cbsTreeRowSelect;
}>;

/**
 * The cost codes a project may use: the ORIGINAL Master CBS rows it has been
 * granted on the Setup page — the Project Cost Code List.
 *
 * Generated S/M rows are filtered out server-side rather than in the browser.
 * The page has never shown them (an original's own S / M badge says whether it
 * carries them), and they were ~19% of the rows shipped.
 *
 * Project-scoped, so any member of the project can view it.
 */
export const fetchProjectCostCodes = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(
    projectIdScopedHandler(({ data: projectId }) =>
      prisma.cbsItem.findMany({
        where: {
          rowType: "ORIGINAL",
          allowedInProjects: { some: { id: projectId } },
        },
        orderBy: { id: "asc" },
        select: cbsTreeRowSelect,
      }),
    ),
  );

/**
 * The WHOLE catalog, ignoring every project allow-list. Feeds both
 * administrator-only CBS trees — Setup's allow-list editor and Admin → Master
 * CBS — under ONE query key, so visiting both doesn't download it twice.
 *
 * Admin-guarded: it exposes accounts a given project was deliberately not
 * granted, and both callers are admin-only routes anyway.
 */
export const fetchCbsCatalog = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(() =>
    prisma.cbsItem.findMany({
      orderBy: { id: "asc" },
      select: cbsTreeRowSelect,
    }),
  ),
);

export const cbsCatalogQueryOptions = () =>
  queryOptions({
    queryKey: qk.cbs.catalog(),
    queryFn: () => fetchCbsCatalog(),
    // The catalog changes only on a CBS re-import.
    staleTime: Infinity,
  });

export const projectCostCodesQueryOptions = (projectId: number) =>
  queryOptions({
    queryKey: qk.cbs.projectCostCodes(projectId),
    queryFn: () => fetchProjectCostCodes({ data: projectId }),
    // Changes only when Setup saves (which invalidates this key) or the CBS
    // is re-imported; don't re-ship ~thousands of rows on every page mount.
    staleTime: Infinity,
  });

/** Every workbook column for one dictionary row — the detail panel. */
export const fetchCbsItemDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => Id.parse(input))
  .handler(({ data: id }) =>
    prisma.cbsItem.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        displayCode: true,
        costCode: true,
        name: true,
        uom: true,
        rowType: true,
        generatedFrom: true,
        subReporting: true,
        materialCode: true,
        materialType: true,
        costCenter: true,
        costClassification: true,
        status: true,
        accountDescription: true,
        l2Description: true,
        core: true,
        coreExtension: true,
        wbs: true,
        p6CostAccount: true,
        gl: true,
        discipline: true,
        description: true,
        notes: true,
      },
    }),
  );

export type CbsItemDetail = Awaited<ReturnType<typeof fetchCbsItemDetail>>;

export const cbsItemDetailQueryOptions = (id: number) =>
  queryOptions({
    queryKey: qk.cbs.itemDetail(id),
    queryFn: () => fetchCbsItemDetail({ data: id }),
    // Catalog data; changes only on a CBS re-import.
    staleTime: Infinity,
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
    queryKey: qk.cbs.codeSearch(query),
    queryFn: () => searchCbsCodeOptions({ data: { query } }),
    // The same query rarely changes mid-session; cache a few minutes. Keep the
    // previous page visible while the next keystroke's query is in flight so
    // the dropdown doesn't flicker empty.
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

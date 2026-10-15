import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { prisma } from "../server/db";
import { adminHandlerNoInput } from "./users.server";
import { buildCoreLinks, type CoreLinkModel } from "~/lib/cbs-core-links";
import { qk } from "~/lib/query-keys";

/**
 * The Core-code roll-up, built on the server.
 *
 * `buildCoreLinks` needs every row's `core` cell to resolve the links, but the
 * result is an aggregate: ~225 accounts and the items under them, against a
 * catalog of nearly 12,000 rows. Building it here ships the answer instead of
 * the evidence, and keeps `core` off the main catalog payload, which three
 * other views already pay for.
 *
 * Admin-guarded for the same reason `fetchCbsCatalog` is: it spans the whole
 * dictionary, with no project allow-list applied.
 */
export const fetchCbsCoreLinks = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<CoreLinkModel> => {
    const rows = await prisma.cbsItem.findMany({
      select: { displayCode: true, costCode: true, name: true, core: true },
      orderBy: { id: "asc" },
    });
    return buildCoreLinks(rows);
  }),
);

export const cbsCoreLinksQueryOptions = () =>
  queryOptions({
    queryKey: qk.cbs.coreLinks(),
    queryFn: () => fetchCbsCoreLinks(),
    // The dictionary only changes on an import, so this can sit a long while.
    staleTime: 10 * 60 * 1000,
  });

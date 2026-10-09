import { prisma } from "../server/db";
import { cbsAncestorCodes } from "~/lib/cbs-tree";
import { cbsTreeRowSelect, type CbsWireRow } from "./cbs";

/**
 * Server-side CBS row reads shared by the page queries and the Excel export.
 *
 * Both have to agree on which rows exist for a project — the export's whole
 * promise is that the file matches the screen — so the rule lives here once
 * rather than being copied into each caller.
 */

/** A granted row, or an ancestor pulled in so the granted rows nest. */
export type ProjectCostCodeRow = CbsWireRow & { context?: boolean };

/**
 * The cost codes a project may use: the ORIGINAL rows granted on the Setup
 * page, plus the ancestor summaries needed for the hierarchy to read.
 *
 * Without the ancestors a child whose parent is ungranted has nothing to hang
 * from and renders as a top-level orphan — "Field Staff" beside the
 * disciplines rather than under "Field Indirects". They come back flagged
 * `context: true`: shown muted, excluded from counts, and not usable as codes.
 *
 * Generated S/M rows are excluded here rather than in the browser. The page
 * has never shown them (an original's own S / M badge says whether it carries
 * them), and they were ~19% of the rows shipped.
 */
export async function projectCostCodeRows(
  projectId: number,
): Promise<ProjectCostCodeRow[]> {
  const granted = await prisma.cbsItem.findMany({
    where: {
      rowType: "ORIGINAL",
      allowedInProjects: { some: { id: projectId } },
    },
    orderBy: { id: "asc" },
    select: cbsTreeRowSelect,
  });

  // Which ancestor summaries are missing from the granted set.
  const have = new Set(granted.map((g) => g.displayCode));
  const wanted = new Set<string>();
  for (const g of granted) {
    for (const code of cbsAncestorCodes(g.displayCode)) {
      if (!have.has(code)) wanted.add(code);
    }
  }
  if (wanted.size === 0) return granted;

  const ancestors = await prisma.cbsItem.findMany({
    where: { rowType: "ORIGINAL", displayCode: { in: [...wanted] } },
    orderBy: { id: "asc" },
    select: cbsTreeRowSelect,
  });
  return [...granted, ...ancestors.map((a) => ({ ...a, context: true }))];
}

/** Every catalog row, or only the originals — the two Admin → CBS sections. */
export function cbsCatalogRows(originalsOnly: boolean): Promise<CbsWireRow[]> {
  return prisma.cbsItem.findMany({
    where: originalsOnly ? { rowType: "ORIGINAL" } : {},
    orderBy: { id: "asc" },
    select: cbsTreeRowSelect,
  });
}

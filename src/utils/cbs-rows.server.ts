import { prisma } from "../server/db";
import { cbsAncestorCodes, cbsIsActive } from "~/lib/cbs-tree";
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
 * The cost codes a project may use: every row granted on the Setup page —
 * each cost line, generated S / M rows included, as the CBS Dictionary lists
 * them — plus the ancestor summaries needed for the hierarchy to read.
 *
 * Without the ancestors a child whose parent is ungranted has nothing to hang
 * from and renders as a top-level orphan — "Field Staff" beside the
 * disciplines rather than under "Field Indirects". They come back flagged
 * `context: true`: shown muted, excluded from counts, and not usable as codes.
 */
export async function projectCostCodeRows(
  projectId: number,
): Promise<ProjectCostCodeRow[]> {
  const all = await prisma.cbsItem.findMany({
    where: { allowedInProjects: { some: { id: projectId } } },
    orderBy: { id: "asc" },
    select: cbsTreeRowSelect,
  });
  // Only Active codes are offered — not Inactive or Retired ones, even where a
  // project was granted one before its status changed. Filtered here in JS rather than in the `where` so
  // the rule — blank Status counts as active — stays in one place and reads
  // the same for every caller; see `cbsIsActive`.
  const granted = all.filter((row) => cbsIsActive(row.status));

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
    // Any row type: a typed line's ancestors include its parent's line of the
    // same type ("…-S" under "…-S"), which may be a generated row.
    where: { displayCode: { in: [...wanted] } },
    orderBy: { id: "asc" },
    select: cbsTreeRowSelect,
  });
  // A retired ancestor is still pulled in. It is structure, not a code anyone
  // can pick — `context: true` rows are muted, uncounted and unselectable —
  // and dropping it would strand its active children at the top level.
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

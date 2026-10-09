import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../server/db";
import { adminHandler, requireProjectAccess } from "./users.server";
import {
  buildCbsTree,
  cbsAncestorCodes,
  cbsFilterIsEmpty,
  pruneCbsTree,
  withCbsLevels,
  type CbsRowFilter,
} from "~/lib/cbs-tree";
import {
  CBS_EXPORT_LABELS,
  CBS_EXPORT_VIEWS,
  flattenCbsForExport,
  type CbsExportView,
} from "~/lib/cbs-export";
import { cbsTreeRowSelect, type CbsWireRow } from "./cbs";
import { buildCbsWorkbook } from "./cbs-xlsx.server";

/**
 * Excel export for the three CBS views — the Project Cost Code List, the CBS
 * Code Book and the CBS Dictionary.
 *
 * Built on the server, not in the browser: exceljs is ~1 MB, and the data and
 * the access guards are here already. The client sends only the view and the
 * filter in force, and the server rebuilds the tree with the SAME pure
 * functions the page used (`buildCbsTree` + `pruneCbsTree`), so the file holds
 * exactly the rows the user was looking at. Reproducing the filter is cheaper
 * and more honest than shipping thousands of row ids back up.
 *
 * Returns base64 — a server fn's response is JSON, and a one-off export is the
 * right place to pay 33% encoding overhead rather than add a binary endpoint.
 */

const ExportInput = z.object({
  view: z.enum(CBS_EXPORT_VIEWS),
  /** Required for the project-scoped view, ignored by the catalog views. */
  projectId: z.number().int().positive().nullable().default(null),
  filter: z
    .object({
      query: z.string().max(200).default(""),
      sub: z.boolean().default(false),
      material: z.boolean().default(false),
    })
    .default({ query: "", sub: false, material: false }),
});

export type CbsExportInput = z.infer<typeof ExportInput>;

export type CbsExportResult = {
  filename: string;
  /** The .xlsx bytes, base64-encoded. */
  base64: string;
  /** Rows written, context rows included. */
  rowCount: number;
};

/** The granted rows for a project, plus the ancestors that make them nest. */
async function projectCostCodeRows(
  projectId: number,
): Promise<(CbsWireRow & { context?: boolean })[]> {
  const granted = await prisma.cbsItem.findMany({
    where: {
      rowType: "ORIGINAL",
      allowedInProjects: { some: { id: projectId } },
    },
    orderBy: { id: "asc" },
    select: cbsTreeRowSelect,
  });
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

/** A one-line description of the filters, for the sheet's subtitle. */
export function describeCbsFilter(filter: CbsRowFilter): string {
  if (cbsFilterIsEmpty(filter)) return "";
  const parts: string[] = [];
  if (filter.query) parts.push(`matching “${filter.query}”`);
  if (filter.sub && filter.material)
    parts.push("subcontract or material codes");
  else if (filter.sub) parts.push("subcontract codes");
  else if (filter.material) parts.push("material codes");
  return `Filtered: ${parts.join(", ")}`;
}

/**
 * The rows, scope label and guard differ per view; everything downstream of
 * this is shared. Kept as one server fn rather than three so the tree build,
 * filter and workbook assembly exist once.
 */
async function exportFor(input: CbsExportInput): Promise<CbsExportResult> {
  const filter: CbsRowFilter = {
    // The page lower-cases and trims before filtering; match it exactly or a
    // search that showed rows on screen would export none.
    query: input.filter.query.trim().toLowerCase(),
    sub: input.filter.sub,
    material: input.filter.material,
  };

  let rows: (CbsWireRow & { context?: boolean })[];
  let scope: string;

  if (input.view === "projectCostCodes") {
    if (input.projectId === null) {
      throw new Error("A project must be selected to export its cost codes");
    }
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { name: true, displayId: true },
    });
    rows = await projectCostCodeRows(input.projectId);
    scope = project ? `${project.displayId} — ${project.name}` : "Project";
  } else {
    rows = await prisma.cbsItem.findMany({
      where: input.view === "codeBook" ? { rowType: "ORIGINAL" } : {},
      orderBy: { id: "asc" },
      select: cbsTreeRowSelect,
    });
    scope = "Whole catalog — no project allow-list applied";
  }

  const tree = buildCbsTree(rows.map(withCbsLevels));
  const visible = pruneCbsTree(tree, filter).nodes;
  const exportRows = flattenCbsForExport(visible);

  const buffer = await buildCbsWorkbook(exportRows, {
    view: input.view,
    scope,
    filterNote: describeCbsFilter(filter),
    availableRows: exportRows.filter((r) => !r.context).length,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `${CBS_EXPORT_LABELS[input.view].filename}-${stamp}.xlsx`,
    base64: buffer.toString("base64"),
    rowCount: exportRows.length,
  };
}

/**
 * Project-scoped export. Guarded on the project the rows belong to, so a
 * member of one project can't export another's list.
 */
export const exportProjectCostCodes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = ExportInput.parse(input);
    if (parsed.view !== "projectCostCodes") {
      throw new Error("exportProjectCostCodes only exports the project view");
    }
    if (parsed.projectId === null) {
      throw new Error("A project must be selected to export its cost codes");
    }
    return parsed as CbsExportInput & { projectId: number };
  })
  // `projectIdScopedHandler` gates on a bare id, so the access check is made
  // explicitly here against the id inside the payload.
  .handler(async ({ data }) => {
    await requireProjectAccess(data.projectId);
    return exportFor(data);
  });

/**
 * Whole-catalog export (Code Book and Dictionary). Admin-guarded for the same
 * reason `fetchCbsCatalog` is: it exposes accounts no project was granted.
 */
export const exportCbsCatalog = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = ExportInput.parse(input);
    if (parsed.view === "projectCostCodes") {
      throw new Error("exportCbsCatalog only exports the catalog views");
    }
    return parsed;
  })
  .handler(adminHandler(({ data }) => exportFor(data)));

/** Which server fn backs a view — the client picks with this, not a branch. */
export function cbsExporterFor(view: CbsExportView) {
  return view === "projectCostCodes"
    ? exportProjectCostCodes
    : exportCbsCatalog;
}

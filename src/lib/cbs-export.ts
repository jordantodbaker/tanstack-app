import {
  cbsIsMaterial,
  cbsIsSubcontract,
  type CbsTreeItem,
  type CbsTreeNode,
} from "./cbs-tree";

/**
 * Turns a CBS tree into flat rows ready for a spreadsheet, preserving the
 * hierarchy as Excel outline levels so the export collapses the same way the
 * page does.
 *
 * Pure and shared: the server builds the workbook (see
 * `~/utils/cbs-xlsx.server`) from exactly the tree the page built, so the file
 * can't drift from what the user was looking at.
 */

/** One spreadsheet row. `outlineLevel` is the Excel grouping depth. */
export type CbsExportRow = {
  /** Tree depth, 0 for a root — Excel's row outline level. */
  outlineLevel: number;
  /** Code level, which drives the fill colour (see `cbsColorForLevel`). */
  level: number;
  displayCode: string;
  name: string;
  uom: string;
  accountDescription: string;
  /** "YES" when the row carries a subcontract code, else "". */
  subCode: string;
  /** "YES" when the row carries a material code, else "". */
  materialCode: string;
  /**
   * True for an ancestor pulled in only so the hierarchy reads — not a code
   * the project may use. Rendered muted on the page; italic + grey in Excel.
   */
  context: boolean;
};

/** A column of the exported sheet. */
export type CbsExportColumn = {
  header: string;
  /** Excel column width, in characters. */
  width: number;
  get: (row: CbsExportRow) => string | number;
};

/**
 * The exported columns.
 *
 * Name is indented by outline level as well as grouped: Excel's grouping
 * controls hide rows but don't indent them, and a flat column of names loses
 * the shape the tree conveys. Two spaces per level matches how the page reads.
 *
 * Deliberately no row-type column. ORIGINAL / SUB / MATERIAL is our own
 * vocabulary for how a row got into the dictionary, which is no business of
 * whoever opens the file — and nothing is lost by dropping it: a generated
 * row's cost type is the last segment of its display code, and the Sub Code
 * and Material Code columns say what a row carries.
 */
export const CBS_EXPORT_COLUMNS: readonly CbsExportColumn[] = [
  { header: "Display Code", width: 20, get: (r) => r.displayCode },
  {
    header: "Name",
    width: 52,
    get: (r) => `${"  ".repeat(r.outlineLevel)}${r.name}`,
  },
  { header: "UOM", width: 8, get: (r) => r.uom },
  { header: "Level", width: 7, get: (r) => r.level },
  { header: "Sub Code", width: 10, get: (r) => r.subCode },
  { header: "Material Code", width: 14, get: (r) => r.materialCode },
  {
    header: "Account Description",
    width: 46,
    get: (r) => r.accountDescription,
  },
  {
    header: "Available",
    width: 11,
    // The one column that only means anything on a project-scoped export, but
    // harmless elsewhere: nothing is context in a whole-catalog view.
    get: (r) => (r.context ? "Context only" : "Yes"),
  },
];

/** The label shown when a row has no name of its own. */
function labelFor(item: CbsTreeItem): string {
  return item.name || item.accountDescription || item.displayCode;
}

/**
 * Pre-order walk of a (possibly filtered) tree into export rows.
 *
 * Takes the tree the page derived — so whatever the search box and the
 * Subcontracts / Materials toggles pruned is already gone, and the export
 * carries the visible rows and nothing else. Expansion state is deliberately
 * NOT consulted: a collapsed branch is still exported, because Excel's own
 * grouping is what collapses it there.
 */
export function flattenCbsForExport<T extends CbsTreeItem>(
  nodes: readonly CbsTreeNode<T>[],
): CbsExportRow[] {
  const out: CbsExportRow[] = [];
  const walk = (list: readonly CbsTreeNode<T>[]) => {
    for (const node of list) {
      const { item } = node;
      out.push({
        outlineLevel: node.depth,
        level: node.level,
        displayCode: item.displayCode,
        name: labelFor(item),
        uom: item.uom,
        accountDescription: item.accountDescription,
        // A context row is not an available code, so its flags are suppressed
        // here exactly as the badges are on the page.
        subCode: !item.context && cbsIsSubcontract(item) ? "YES" : "",
        materialCode: !item.context && cbsIsMaterial(item) ? "YES" : "",
        context: item.context === true,
      });
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * The project title with a redundant leading project number removed.
 *
 * `Project.displayId` is the number ("1901") and `Project.name` the title, but
 * the names in use already start with the number ("1901 - FIME Engineering"),
 * so printing both verbatim reads "1901 — 1901 - FIME Engineering". Only a
 * leading copy of this project's own number plus one separator is stripped;
 * anything else is left exactly as stored.
 */
export function cbsProjectTitle(displayId: string, name: string): string {
  const id = displayId.trim();
  if (id === "") return name.trim();
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = name
    .trim()
    .replace(new RegExp(`^${escaped}\\s*[-–—:·]\\s*`), "");
  // A name that is *only* the number has nothing left to show; keep it.
  return stripped === "" ? name.trim() : stripped;
}

/**
 * The metadata block above the header, as label/value pairs. Fixed length and
 * order so the sheet's layout is stable for anyone reading it with a formula.
 */
export type CbsExportMetaRow = { label: string; value: string | number };

/** The three CBS views that can be exported. */
export const CBS_EXPORT_VIEWS = [
  "projectCostCodes",
  "codeBook",
  "dictionary",
] as const;

export type CbsExportView = (typeof CBS_EXPORT_VIEWS)[number];

/** Sheet title and filename stem per view. */
export const CBS_EXPORT_LABELS: Record<
  CbsExportView,
  { sheet: string; filename: string }
> = {
  projectCostCodes: {
    sheet: "Project Cost Codes",
    filename: "project-cost-code-list",
  },
  codeBook: { sheet: "Original Codes", filename: "cbs-original-codes" },
  dictionary: { sheet: "CBS Dictionary", filename: "cbs-dictionary" },
};

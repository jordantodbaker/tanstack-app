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
  rowType: string;
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
  { header: "Row Type", width: 11, get: (r) => r.rowType },
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
        rowType: item.rowType,
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
  codeBook: { sheet: "CBS Code Book", filename: "cbs-code-book" },
  dictionary: { sheet: "CBS Dictionary", filename: "cbs-dictionary" },
};

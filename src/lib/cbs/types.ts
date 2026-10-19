/**
 * The row and node shapes every other `cbs/` module is written against, plus
 * the display code's magic segments. Types and constants only — nothing here
 * imports anything, which is what keeps the rest of the group acyclic.
 */

/**
 * Whether a row came from the Master CBS or was generated as its S/M twin
 * (see `expandCbsDictionary`).
 *
 * Every row in the database currently reads "ORIGINAL", so the badges and the
 * Dictionary's sub/material counts all sit at zero — which looks like dead
 * code and is not. CBS.xlsx now arrives pre-expanded, with each account's
 * cost-type rows already present under their own display codes, so the
 * generator finds every twin it would create already there and skips it
 * (4,737 skipped on the 2026-10 workbook, 0 generated). It used to arrive
 * un-expanded, and would fill these in again if it ever does.
 */
export type CbsRowType = "ORIGINAL" | "SUB" | "MATERIAL";

export type CbsTreeItem = {
  id: number;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  /** The trailing cost-type segment of the display code ("0", "S", "M", "L", …). */
  l6: string;
  displayCode: string;
  name: string;
  accountDescription: string;
  uom: string;
  rowType: CbsRowType;
  /** The workbook's "Sub Code" flag. Optional so fixtures and callers that
   *  don't badge by flag need not carry it. */
  subReporting?: boolean | null;
  /** The workbook's "Material Code" flag. */
  materialCode?: boolean | null;
  /** The workbook's "Labor Code" flag. */
  laborCode?: boolean | null;
  /** The workbook's "Equipment Code" flag. */
  equipmentCode?: boolean | null;
  /** The workbook's "Other Code" flag. */
  otherCode?: boolean | null;
  /** The workbook's "Status" cell — "Active", "Inactive", or blank. */
  status?: string | null;
  /**
   * True for a row included only so the hierarchy reads correctly — an
   * ancestor of something the project HAS been granted, which it has not been
   * granted itself. Rendered muted and badge-less, and left out of row counts.
   */
  context?: boolean;
};

export type CbsTreeNode<T extends CbsTreeItem = CbsTreeItem> = {
  /** Unique key for React/expand state — the display code (plus the row id
   *  only if a catalog ever carries duplicate codes). */
  pathKey: string;
  /** Nesting depth in the built tree (0 = root). Drives indentation. */
  depth: number;
  /** Code level (see `getCbsLevel`). Drives colouring, like the workbook's
   *  colour-by-outline-level; can exceed `depth` when an intermediate code
   *  is absent and the row collapsed up to a shallower ancestor. */
  level: number;
  item: T;
  children: CbsTreeNode<T>[];
  /** This node's item id followed by every descendant's. */
  descendantItemIds: number[];
  /** Pre-lowercased searchable text for this node (own item only). Subtree
   *  matching walks children instead of storing every ancestor's text again. */
  searchHaystack: string;
};

export const LEVEL_DEFAULT = "00";
export const BACKBONE_TYPE = "0";
/** Cost types (the workbook's L7) for the generated subcontract / material rows. */
export const SUB_TYPE = "S";
export const MATERIAL_TYPE = "M";

/**
 * Legacy phase codes as tree rows: the retired codes that predate the CBS,
 * which only the CBS Dictionary shows, and only on request.
 */
import { BACKBONE_TYPE, type CbsTreeItem, type CbsTreeNode } from "./types";
import { CBS_COST_TYPES, cbsSearchHaystack, type CbsCostType } from "./filter";

/** Seven characters, no dashes, X-padded summaries. One source code has six. */
export function isCbsLegacyCode(code: string): boolean {
  return /^[0-9X]{6,7}$/.test(code);
}

/** A stored legacy row, as much of it as a tree row needs. */
export type CbsLegacyWireRow = {
  id: number;
  code: string;
  name: string;
  uom: string;
  status: string | null;
} & Record<CbsCostType["flag"], boolean | null>;

/**
 * A stored row as the tree takes it. The id is negated: legacy rows are in
 * their own table, so their ids overlap the catalog's. The cost type is the
 * first its columns name (one row is "L or M"), "0" for a summary, so the
 * cost-type buttons and counts read legacy rows like any other.
 */
export function cbsLegacyTreeRow({ id, code, ...row }: CbsLegacyWireRow) {
  const type = CBS_COST_TYPES.find((t) => row[t.flag]);
  return {
    ...row,
    id: -id,
    displayCode: code,
    l1: code.slice(0, 1),
    l2: code.slice(1, 3),
    l3: code.slice(3, 5),
    l4: code.slice(5),
    l5: "",
    l6: type?.code ?? BACKBONE_TYPE,
    accountDescription: "",
    costClassification: null,
    materialType: null,
    discipline: null,
    isOriginal: true,
    legacy: true,
  };
}

/**
 * Nests legacy rows by the ORDER they come in, as the sheet outlines them: a
 * row belongs to the nearest summary above it whose digits stop sooner.
 *
 * Not by code prefix, because the codes do not agree with the outline. The
 * electrical details are numbered 5-something under summaries numbered 66x,
 * Refractory is 282XXXX inside 88XXXXX, and seven codes repeat.
 */
export function buildCbsLegacyTree<T extends CbsTreeItem>(
  items: readonly T[],
): CbsTreeNode<T>[] {
  const roots: CbsTreeNode<T>[] = [];
  const open: { digits: number; node: CbsTreeNode<T> }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const code = item.displayCode;
    const x = code.indexOf("X");
    const digits = x < 0 ? Infinity : x;
    while (open.length > 0 && open[open.length - 1].digits >= digits) {
      open.pop();
    }
    const depth = open.length;
    const node: CbsTreeNode<T> = {
      pathKey: seen.has(code) ? `${code}#${item.id}` : code,
      depth,
      level: depth,
      item,
      children: [],
      descendantItemIds: [item.id],
      searchHaystack: cbsSearchHaystack(item),
    };
    seen.add(code);
    for (const o of open) o.node.descendantItemIds.push(item.id);
    (open[open.length - 1]?.node.children ?? roots).push(node);
    if (x >= 0) open.push({ digits, node });
  }
  return roots;
}

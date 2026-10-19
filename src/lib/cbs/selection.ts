/**
 * Tri-state checkbox arithmetic for the Setup page's allow-list editor: how
 * many of a node's descendants are granted, and whether that reads as checked,
 * unchecked or indeterminate.
 */
import { type CbsTreeNode } from "./types";

export type SelectionState = "checked" | "unchecked" | "indeterminate";

function selectionState(selected: number, total: number): SelectionState {
  if (selected === 0) return "unchecked";
  if (selected === total) return "checked";
  return "indeterminate";
}

/** Selection state of one node by walking its descendant ids — fine for a
 *  single click; use `computeCbsSelectionCounts` when rendering many rows. */
export function getNodeSelectionState(
  node: CbsTreeNode,
  selectedIds: Set<number>,
): SelectionState {
  let selected = 0;
  for (const id of node.descendantItemIds) {
    if (selectedIds.has(id)) selected++;
  }
  return selectionState(selected, node.descendantItemIds.length);
}

/**
 * Selected-descendant count for every node, keyed by pathKey, in one
 * bottom-up pass (O(n) per selection change) — so rendering thousands of
 * rows doesn't re-walk each node's descendant list per row.
 */
export function computeCbsSelectionCounts(
  nodes: CbsTreeNode[],
  selectedIds: Set<number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const rec = (n: CbsTreeNode): number => {
    let selected = selectedIds.has(n.item.id) ? 1 : 0;
    for (const c of n.children) selected += rec(c);
    counts.set(n.pathKey, selected);
    return selected;
  };
  for (const n of nodes) rec(n);
  return counts;
}

/** Selection state from a `computeCbsSelectionCounts` map. */
export function selectionStateFromCounts(
  node: CbsTreeNode,
  counts: Map<string, number>,
): SelectionState {
  return selectionState(
    counts.get(node.pathKey) ?? 0,
    node.descendantItemIds.length,
  );
}

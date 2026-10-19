/**
 * Which nodes to open — the path keys behind "expand all" and the colour
 * legend's L0…L5 buttons.
 */
import { type CbsTreeNode } from "./types";

/**
 * Path keys to open so the tree shows down to `level` and no further — what
 * the colour legend's L0…L5 buttons set. Keyed on the CODE level (the legend's
 * own colour key), not tree depth, so "L2" means the blue rows whatever depth
 * they landed at. Level 0 opens nothing, which is "collapse all".
 */
export function collectKeysToLevel(
  nodes: CbsTreeNode[],
  level: number,
): string[] {
  const keys: string[] = [];
  const walk = (list: CbsTreeNode[]) => {
    for (const n of list) {
      // A node at or past the target stays shut, and nothing under it can be
      // visible, so there is no reason to walk into it.
      if (n.children.length > 0 && n.level < level) {
        keys.push(n.pathKey);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

/** Path keys of every node that has children — for "Expand all". */
export function collectExpandableKeys(nodes: CbsTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (list: CbsTreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        keys.push(n.pathKey);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

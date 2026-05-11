export type CbsTreeItem = {
  id: number;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  l6: string;
  displayCode: string;
  name: string;
  accountDescription: string;
  l2Description: string | null;
  uom: string;
};

export type CbsTreeNode = {
  pathKey: string;
  depth: number;
  segment: string;
  item: CbsTreeItem | null;
  children: CbsTreeNode[];
  descendantItemIds: number[];
  /** Pre-lowercased searchable text for this node (own item only). */
  searchHaystack: string;
  /** Pre-lowercased searchable text covering this node and all descendants. */
  subtreeHaystack: string;
};

const LEVEL_DEFAULT = "00";

export function getGroupL1(l1: string): string {
  if (l1.length < 3) return l1;
  const firstTwo = Number.parseInt(l1.substring(0, 2), 10);
  if (Number.isNaN(firstTwo)) return l1;
  if (firstTwo < 10) return `0${l1[1]}0`;
  return `${l1[0]}00`;
}

function getPath(item: CbsTreeItem): string[] {
  const group = getGroupL1(item.l1);
  const path: string[] = [group];
  if (item.l1 !== group) path.push(item.l1);
  if (item.l2 !== LEVEL_DEFAULT) {
    path.push(item.l2);
    if (item.l3 !== LEVEL_DEFAULT) {
      path.push(item.l3);
      if (item.l4 !== LEVEL_DEFAULT) {
        path.push(item.l4);
        if (item.l5 !== LEVEL_DEFAULT) {
          path.push(item.l5);
        }
      }
    }
  }
  return path;
}

export function buildCbsTree(items: CbsTreeItem[]): CbsTreeNode[] {
  type BuildNode = {
    pathKey: string;
    depth: number;
    segment: string;
    item: CbsTreeItem | null;
    children: Map<string, BuildNode>;
  };

  const root: { children: Map<string, BuildNode> } = { children: new Map() };

  function ensureNode(item: CbsTreeItem): BuildNode {
    const path = getPath(item);
    let parent: { children: Map<string, BuildNode> } = root;
    let pathKey = "";
    let node!: BuildNode;
    let depth = 0;
    for (const segment of path) {
      depth++;
      pathKey = pathKey ? `${pathKey}|${segment}` : segment;
      const existing = parent.children.get(segment);
      if (existing) {
        node = existing;
      } else {
        node = {
          pathKey,
          depth,
          segment,
          item: null,
          children: new Map(),
        };
        parent.children.set(segment, node);
      }
      parent = node;
    }
    return node;
  }

  for (const item of items) {
    const node = ensureNode(item);
    if (!node.item) node.item = item;
  }

  function toOutput(node: BuildNode): CbsTreeNode {
    const children = Array.from(node.children.values())
      .sort((a, b) => a.segment.localeCompare(b.segment))
      .map(toOutput);
    const descendantItemIds: number[] = [];
    if (node.item) descendantItemIds.push(node.item.id);
    for (const c of children) descendantItemIds.push(...c.descendantItemIds);
    const own = node.item
      ? `${node.item.displayCode} ${node.item.name} ${node.item.accountDescription}`.toLowerCase()
      : "";
    let subtree = own;
    for (const c of children) subtree += "\n" + c.subtreeHaystack;
    return {
      pathKey: node.pathKey,
      depth: node.depth,
      segment: node.segment,
      item: node.item,
      children,
      descendantItemIds,
      searchHaystack: own,
      subtreeHaystack: subtree,
    };
  }

  return Array.from(root.children.values())
    .sort((a, b) => a.segment.localeCompare(b.segment))
    .map(toOutput);
}

export type SelectionState = "checked" | "unchecked" | "indeterminate";

export function getNodeSelectionState(
  node: CbsTreeNode,
  selectedIds: Set<number>,
): SelectionState {
  let selected = 0;
  for (const id of node.descendantItemIds) {
    if (selectedIds.has(id)) selected++;
  }
  if (selected === 0) return "unchecked";
  if (selected === node.descendantItemIds.length) return "checked";
  return "indeterminate";
}

/**
 * Returns true if this node or any of its descendants matches `lowerQuery`.
 * `lowerQuery` must already be lowercased; pass "" to match everything.
 */
export function nodeMatchesSearch(
  node: CbsTreeNode,
  lowerQuery: string,
): boolean {
  if (!lowerQuery) return true;
  return node.subtreeHaystack.includes(lowerQuery);
}

/**
 * Single-pass filter that prunes nodes whose subtrees don't contain
 * `lowerQuery`. Returns the original `nodes` array when the query is empty so
 * callers can fast-path on reference identity.
 */
export function filterCbsTree(
  nodes: CbsTreeNode[],
  lowerQuery: string,
): CbsTreeNode[] {
  if (!lowerQuery) return nodes;
  const out: CbsTreeNode[] = [];
  for (const n of nodes) {
    if (!n.subtreeHaystack.includes(lowerQuery)) continue;
    if (n.searchHaystack.includes(lowerQuery)) {
      // Self matches — keep entire subtree intact.
      out.push(n);
    } else {
      // Only descendants match — recurse.
      out.push({ ...n, children: filterCbsTree(n.children, lowerQuery) });
    }
  }
  return out;
}

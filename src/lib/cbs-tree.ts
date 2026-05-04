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
  level: 1 | 2 | 3 | 4 | 5;
  segment: string;
  item: CbsTreeItem | null;
  children: CbsTreeNode[];
  descendantItemIds: number[];
};

const LEVEL_DEFAULT = "00";

function getDepth(item: CbsTreeItem): 1 | 2 | 3 | 4 | 5 {
  if (item.l5 !== LEVEL_DEFAULT) return 5;
  if (item.l4 !== LEVEL_DEFAULT) return 4;
  if (item.l3 !== LEVEL_DEFAULT) return 3;
  if (item.l2 !== LEVEL_DEFAULT) return 2;
  return 1;
}

function getSegment(item: CbsTreeItem, level: 1 | 2 | 3 | 4 | 5): string {
  return item[`l${level}` as const];
}

export function buildCbsTree(items: CbsTreeItem[]): CbsTreeNode[] {
  type BuildNode = {
    pathKey: string;
    level: 1 | 2 | 3 | 4 | 5;
    segment: string;
    item: CbsTreeItem | null;
    children: Map<string, BuildNode>;
  };

  const root: { children: Map<string, BuildNode> } = { children: new Map() };

  function ensureNode(item: CbsTreeItem, depth: 1 | 2 | 3 | 4 | 5): BuildNode {
    let parent: { children: Map<string, BuildNode> } = root;
    let pathKey = "";
    let node!: BuildNode;
    for (let d = 1; d <= depth; d++) {
      const level = d as 1 | 2 | 3 | 4 | 5;
      const segment = getSegment(item, level);
      pathKey = pathKey ? `${pathKey}|${segment}` : segment;
      const existing = parent.children.get(segment);
      if (existing) {
        node = existing;
      } else {
        node = {
          pathKey,
          level,
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
    const depth = getDepth(item);
    const node = ensureNode(item, depth);
    if (!node.item) node.item = item;
  }

  function toOutput(node: BuildNode): CbsTreeNode {
    const children = Array.from(node.children.values())
      .sort((a, b) => a.segment.localeCompare(b.segment))
      .map(toOutput);
    const descendantItemIds: number[] = [];
    if (node.item) descendantItemIds.push(node.item.id);
    for (const c of children) descendantItemIds.push(...c.descendantItemIds);
    return {
      pathKey: node.pathKey,
      level: node.level,
      segment: node.segment,
      item: node.item,
      children,
      descendantItemIds,
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

export function nodeMatchesSearch(
  node: CbsTreeNode,
  query: string,
): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const item = node.item;
  if (item) {
    if (item.displayCode.toLowerCase().includes(q)) return true;
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.accountDescription.toLowerCase().includes(q)) return true;
  }
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

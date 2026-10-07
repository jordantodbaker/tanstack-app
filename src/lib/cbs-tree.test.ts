import { describe, expect, it } from "vitest";
import {
  buildCbsTree,
  cbsFlagBadges,
  cbsRowTypeBadges,
  compareCbsDisplayCodes,
  computeCbsSelectionCounts,
  filterCbsTree,
  getCbsLevel,
  getGroupL1,
  getNodeSelectionState,
  parseCbsDisplayCode,
  pruneCbsTree,
  rowTypeBadge,
  selectionStateFromCounts,
  type CbsTreeItem,
  type CbsTreeNode,
} from "./cbs-tree";

let nextId = 1;
/** Build an item from its display code; segments are derived from the code. */
function item(
  displayCode: string,
  overrides: Partial<CbsTreeItem> = {},
): CbsTreeItem {
  return {
    id: nextId++,
    ...parseCbsDisplayCode(displayCode),
    displayCode,
    name: "",
    accountDescription: "",
    l2Description: null,
    uom: "",
    rowType: "ORIGINAL",
    ...overrides,
  };
}

function find(nodes: CbsTreeNode[], code: string): CbsTreeNode | undefined {
  for (const n of nodes) {
    if (n.item.displayCode === code) return n;
    const found = find(n.children, code);
    if (found) return found;
  }
  return undefined;
}

function parentOf(nodes: CbsTreeNode[], code: string): string | null {
  const walk = (list: CbsTreeNode[], parent: string | null): string | null | undefined => {
    for (const n of list) {
      if (n.item.displayCode === code) return parent;
      const r = walk(n.children, n.item.displayCode);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(nodes, null) ?? null;
}

describe("getGroupL1", () => {
  it("returns the input unchanged when it is too short or non-numeric", () => {
    expect(getGroupL1("")).toBe("");
    expect(getGroupL1("12")).toBe("12");
    expect(getGroupL1("ABC")).toBe("ABC");
  });

  it("buckets 0xx codes to 0x0", () => {
    expect(getGroupL1("010")).toBe("010");
    expect(getGroupL1("051")).toBe("050");
    expect(getGroupL1("099")).toBe("090");
  });

  it("buckets x.. codes to x00", () => {
    expect(getGroupL1("101")).toBe("100");
    expect(getGroupL1("250")).toBe("200");
    expect(getGroupL1("601")).toBe("600");
    expect(getGroupL1("999")).toBe("900");
  });
});

describe("getCbsLevel", () => {
  it("counts the group root as 0, the L1 account as 1, then one per segment", () => {
    expect(getCbsLevel(item("600-00-0000-00-0"))).toBe(0);
    expect(getCbsLevel(item("601-00-0000-00-0"))).toBe(1);
    expect(getCbsLevel(item("601-05-0000-00-0"))).toBe(2);
    expect(getCbsLevel(item("601-05-1000-00-L"))).toBe(3);
    expect(getCbsLevel(item("601-05-1050-00-L"))).toBe(4);
    expect(getCbsLevel(item("601-05-1050-10-L"))).toBe(5);
  });

  it("stops at the first '00' segment so trailing markers don't count", () => {
    // Pipe Shop convention: "-ST" in the last slot is a schedule marker.
    expect(getCbsLevel(item("610-LB-1200-ST-L"))).toBe(3);
    expect(getCbsLevel(item("610-LB-0000-LB-L"))).toBe(2);
  });

  it("treats a group root's S/M twin as level 1 (one below the root)", () => {
    expect(getCbsLevel(item("100-00-0000-00-M"))).toBe(1);
    expect(getCbsLevel(item("010-00-0000-00-S"))).toBe(1);
  });
});

describe("compareCbsDisplayCodes", () => {
  it("orders parents before children and twins 0 → S → M → others", () => {
    const codes = [
      "601-05-0000-00-M",
      "601-05-1000-00-L",
      "601-05-0000-00-S",
      "601-00-0000-00-0",
      "601-05-0000-00-0",
      "601-05-0000-00-L",
    ];
    expect([...codes].sort(compareCbsDisplayCodes)).toEqual([
      "601-00-0000-00-0",
      "601-05-0000-00-0",
      "601-05-0000-00-S",
      "601-05-0000-00-M",
      "601-05-0000-00-L",
      "601-05-1000-00-L",
    ]);
  });
});

describe("buildCbsTree", () => {
  it("nests L1 accounts under their group root and segments under the account", () => {
    const tree = buildCbsTree([
      item("601-05-0000-00-0"),
      item("600-00-0000-00-0"),
      item("601-00-0000-00-0"),
      item("699-00-0000-00-0"),
      item("701-00-0000-00-0"),
    ]);
    expect(tree.map((n) => n.item.displayCode)).toEqual([
      "600-00-0000-00-0",
      "701-00-0000-00-0", // no 700 root present → 701 is a root itself
    ]);
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "601-00-0000-00-0",
      "699-00-0000-00-0",
    ]);
    expect(parentOf(tree, "601-05-0000-00-0")).toBe("601-00-0000-00-0");
    expect(find(tree, "601-05-0000-00-0")?.depth).toBe(2);
  });

  it("keeps a 0x0 group root that is its own L1 as a single node", () => {
    const tree = buildCbsTree([item("010-00-0000-00-0"), item("012-00-0000-00-0")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].item.displayCode).toBe("010-00-0000-00-0");
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "012-00-0000-00-0",
    ]);
  });

  it("hangs a group root's S/M twins directly under the root, beside its accounts", () => {
    const tree = buildCbsTree([
      item("100-00-0000-00-0"),
      item("100-00-0000-00-S", { rowType: "SUB" }),
      item("100-00-0000-00-M", { rowType: "MATERIAL" }),
      item("101-00-0000-00-0"),
      item("101-00-0000-00-M", { rowType: "MATERIAL" }),
    ]);
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "100-00-0000-00-S",
      "100-00-0000-00-M",
      "101-00-0000-00-0",
      "101-00-0000-00-M",
    ]);
    // The account's twin parents to the root, not to the root's twin.
    expect(parentOf(tree, "101-00-0000-00-M")).toBe("100-00-0000-00-0");
  });

  it("parents cost-type rows to the nearest ancestor of the same type, else the backbone", () => {
    const tree = buildCbsTree([
      item("101-00-0000-00-0"),
      item("101-00-0000-00-M"),
      item("101-05-0000-00-0"),
      item("101-05-0000-00-M"),
      item("101-05-0500-00-M"),
      item("101-15-0000-00-0"),
      item("101-15-0500-00-M"),
      item("101-15-0700-00-L"),
    ]);
    expect(parentOf(tree, "101-05-0000-00-M")).toBe("101-00-0000-00-M");
    expect(parentOf(tree, "101-05-0500-00-M")).toBe("101-05-0000-00-M");
    // No M twin at 101-15 → climbs to the account-level M summary.
    expect(parentOf(tree, "101-15-0500-00-M")).toBe("101-00-0000-00-M");
    // No L ancestor at all → nearest backbone row.
    expect(parentOf(tree, "101-15-0700-00-L")).toBe("101-15-0000-00-0");
  });

  it("collapses a row whose intermediate code is absent up to the nearest existing ancestor", () => {
    const tree = buildCbsTree([
      item("541-12-0000-00-L"),
      item("541-12-0500-00-L"),
      item("541-12-1050-00-L"), // no 541-12-1000-00-L
    ]);
    const node = find(tree, "541-12-1050-00-L")!;
    expect(parentOf(tree, "541-12-1050-00-L")).toBe("541-12-0000-00-L");
    expect(node.depth).toBe(1);
    expect(node.level).toBe(4); // colour still reflects the code depth
  });

  it("follows the Pipe Shop letter-coded lineage, ignoring trailing markers", () => {
    const tree = buildCbsTree([
      item("610-00-0000-00-0"),
      item("610-LB-0000-LB-L"),
      item("610-LB-1200-ST-L"),
      item("610-LB-12FB-00-L"),
      item("610-LB-12FB-ST-L"),
      item("610-LB-1400-ST-L"),
    ]);
    expect(parentOf(tree, "610-LB-1200-ST-L")).toBe("610-LB-0000-LB-L");
    expect(parentOf(tree, "610-LB-12FB-00-L")).toBe("610-LB-1200-ST-L");
    expect(parentOf(tree, "610-LB-12FB-ST-L")).toBe("610-LB-12FB-00-L");
    expect(parentOf(tree, "610-LB-1400-ST-L")).toBe("610-LB-0000-LB-L");
  });

  it("collects descendantItemIds across the whole subtree", () => {
    const a = item("601-00-0000-00-0");
    const b = item("601-01-0000-00-0");
    const c = item("601-02-0000-00-0");
    const d = item("601-02-0100-00-0");
    const tree = buildCbsTree([a, b, c, d]);
    expect(tree[0].descendantItemIds.sort()).toEqual([a.id, b.id, c.id, d.id].sort());
    expect(find(tree, "601-02-0000-00-0")?.descendantItemIds.sort()).toEqual(
      [c.id, d.id].sort(),
    );
  });

  it("precomputes a lowercased searchHaystack from displayCode/name/description", () => {
    const tree = buildCbsTree([
      item("601-00-0000-00-0", {
        name: "Piping Spool",
        accountDescription: "Carbon Steel",
      }),
    ]);
    expect(tree[0].searchHaystack).toBe("601-00-0000-00-0 piping spool carbon steel");
  });

  it("finds a node via descendant text without storing it on the ancestor", () => {
    const tree = buildCbsTree([
      item("601-00-0000-00-0"),
      item("601-01-0000-00-0", { name: "Bolt-up" }),
    ]);
    expect(tree[0].searchHaystack).not.toContain("bolt-up");
    expect(filterCbsTree(tree, "bolt-up")).toHaveLength(1);
  });

  it("keeps both rows when display codes collide, with distinct path keys", () => {
    const first = item("601-00-0000-00-0", { name: "first" });
    const second = item("601-00-0000-00-0", { name: "second" });
    const tree = buildCbsTree([first, second]);
    expect(tree.map((n) => n.item.name)).toEqual(["first", "second"]);
    expect(tree[0].pathKey).toBe("601-00-0000-00-0");
    expect(tree[1].pathKey).toBe(`601-00-0000-00-0#${second.id}`);
  });
});

describe("rowTypeBadge", () => {
  it("marks generated rows only", () => {
    expect(rowTypeBadge("ORIGINAL")).toBeNull();
    expect(rowTypeBadge("SUB")?.label).toBe("S");
    expect(rowTypeBadge("MATERIAL")?.label).toBe("M");
  });
});

describe("cbsFlagBadges", () => {
  const labels = (over: Partial<CbsTreeItem>) =>
    cbsFlagBadges(item("601-05-0000-00-0", over)).map((b) => b.label);

  it("badges the workbook's Sub Code and Material Code flags", () => {
    expect(labels({ subReporting: true, materialCode: false })).toEqual(["S"]);
    expect(labels({ subReporting: false, materialCode: true })).toEqual(["M"]);
  });

  it("shows both when a row carries both flags", () => {
    expect(labels({ subReporting: true, materialCode: true })).toEqual(["S", "M"]);
  });

  it("shows nothing for NO, blank or absent flags", () => {
    expect(labels({ subReporting: false, materialCode: false })).toEqual([]);
    expect(labels({ subReporting: null, materialCode: null })).toEqual([]);
    expect(labels({})).toEqual([]);
  });

  it("reads the flags, not the row type", () => {
    // An original row with Sub Code = YES is badged; a generated SUB row whose
    // own flags are off is not. The two badge schemes are independent.
    expect(labels({ rowType: "ORIGINAL", subReporting: true })).toEqual(["S"]);
    expect(labels({ rowType: "SUB", subReporting: false })).toEqual([]);
  });
});

describe("cbsRowTypeBadges", () => {
  it("wraps the row-type badge as a list", () => {
    expect(cbsRowTypeBadges(item("601-05-0000-00-S", { rowType: "SUB" }))).toEqual([
      { label: "S", title: "Generated sub-code row" },
    ]);
    expect(cbsRowTypeBadges(item("601-05-0000-00-0"))).toEqual([]);
  });
});

describe("filterCbsTree", () => {
  const tree = buildCbsTree([
    item("600-00-0000-00-0", { name: "Pipe" }),
    item("601-00-0000-00-0", { name: "Spool" }),
    item("601-01-0000-00-0", { name: "Bolt" }),
    item("700-00-0000-00-0", { name: "Wire" }),
  ]);

  it("returns the original nodes array by reference when the query is empty", () => {
    expect(filterCbsTree(tree, "")).toBe(tree);
  });

  it("prunes top-level subtrees that don't contain the query", () => {
    const filtered = filterCbsTree(tree, "wire");
    expect(filtered.map((n) => n.item.name)).toEqual(["Wire"]);
  });

  it("preserves identity of a subtree whose own haystack matches", () => {
    // "spool" matches 601's own haystack, so 601 is kept verbatim (with its
    // non-matching child) while its parent 600 is a new object.
    const filtered = filterCbsTree(tree, "spool");
    expect(filtered[0]).not.toBe(tree[0]);
    expect(filtered[0].children[0]).toBe(tree[0].children[0]);
    expect(filtered[0].children[0].children).toHaveLength(1);
  });

  it("recurses into descendant-only matches and only keeps matching children", () => {
    const filtered = filterCbsTree(tree, "bolt");
    expect(filtered[0].children[0].children.map((c) => c.item.name)).toEqual([
      "Bolt",
    ]);
  });
});

describe("pruneCbsTree", () => {
  const tree = buildCbsTree([
    item("600-00-0000-00-0", { name: "Pipe" }),
    item("601-00-0000-00-0", { name: "Spool" }),
    item("601-01-0000-00-0", { name: "Bolt" }),
    item("601-02-0000-00-0", { name: "Gasket" }),
  ]);

  it("keeps matches plus their ancestors and drops non-matching children of a match", () => {
    const { nodes, matches } = pruneCbsTree(tree, "spool");
    expect(matches).toBe(1);
    expect(nodes[0].item.name).toBe("Pipe");
    expect(nodes[0].children[0].item.name).toBe("Spool");
    expect(nodes[0].children[0].children).toHaveLength(0);
  });

  it("counts every self-match", () => {
    expect(pruneCbsTree(tree, "601").matches).toBe(3);
  });
});

describe("getNodeSelectionState", () => {
  const items = [
    item("601-00-0000-00-0"),
    item("601-01-0000-00-0"),
    item("601-02-0000-00-0"),
  ];
  const [a, b, c] = items.map((i) => i.id);
  const node = buildCbsTree(items)[0];

  it("returns 'unchecked' when no descendants are selected", () => {
    expect(getNodeSelectionState(node, new Set())).toBe("unchecked");
  });

  it("returns 'checked' when every descendant is selected", () => {
    expect(getNodeSelectionState(node, new Set([a, b, c]))).toBe("checked");
  });

  it("returns 'indeterminate' when only some descendants are selected", () => {
    expect(getNodeSelectionState(node, new Set([a]))).toBe("indeterminate");
    expect(getNodeSelectionState(node, new Set([b, c]))).toBe("indeterminate");
  });

  it("ignores selected ids that aren't descendants of this node", () => {
    expect(getNodeSelectionState(node, new Set([999]))).toBe("unchecked");
  });
});

describe("computeCbsSelectionCounts / selectionStateFromCounts", () => {
  const items = [
    item("601-00-0000-00-0"),
    item("601-01-0000-00-0"),
    item("601-01-0500-00-0"),
    item("601-02-0000-00-0"),
  ];
  const [root, l01, leaf, l02] = items.map((i) => i.id);
  const tree = buildCbsTree(items);
  const rootNode = tree[0];
  const l01Node = find(tree, "601-01-0000-00-0")!;
  const l02Node = find(tree, "601-02-0000-00-0")!;

  it("counts selected ids per node bottom-up, including the node itself", () => {
    const counts = computeCbsSelectionCounts(tree, new Set([leaf, l02]));
    expect(counts.get(rootNode.pathKey)).toBe(2);
    expect(counts.get(l01Node.pathKey)).toBe(1);
    expect(counts.get(l02Node.pathKey)).toBe(1);
  });

  it("agrees with getNodeSelectionState for every node", () => {
    const selected = new Set([root, l01, leaf]);
    const counts = computeCbsSelectionCounts(tree, selected);
    for (const n of [rootNode, l01Node, l02Node]) {
      expect(selectionStateFromCounts(n, counts)).toBe(
        getNodeSelectionState(n, selected),
      );
    }
    expect(selectionStateFromCounts(l01Node, counts)).toBe("checked");
    expect(selectionStateFromCounts(rootNode, counts)).toBe("indeterminate");
    expect(selectionStateFromCounts(l02Node, counts)).toBe("unchecked");
  });

  it("treats a node missing from the map as unchecked", () => {
    expect(selectionStateFromCounts(rootNode, new Map())).toBe("unchecked");
  });
});

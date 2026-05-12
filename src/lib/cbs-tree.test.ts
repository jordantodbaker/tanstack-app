import { describe, expect, it } from "vitest";
import {
  buildCbsTree,
  filterCbsTree,
  getGroupL1,
  getNodeSelectionState,
  nodeMatchesSearch,
  type CbsTreeItem,
  type CbsTreeNode,
} from "./cbs-tree";

function item(overrides: Partial<CbsTreeItem> & { id: number }): CbsTreeItem {
  return {
    l1: "000",
    l2: "00",
    l3: "00",
    l4: "00",
    l5: "00",
    l6: "00",
    displayCode: "0",
    name: "",
    accountDescription: "",
    l2Description: null,
    uom: "",
    ...overrides,
  };
}

function findByPath(
  nodes: CbsTreeNode[],
  pathKey: string,
): CbsTreeNode | undefined {
  for (const n of nodes) {
    if (n.pathKey === pathKey) return n;
    const found = findByPath(n.children, pathKey);
    if (found) return found;
  }
  return undefined;
}

describe("getGroupL1", () => {
  it("returns the L1 code unchanged when it is shorter than 3 chars", () => {
    expect(getGroupL1("")).toBe("");
    expect(getGroupL1("12")).toBe("12");
  });

  it("returns the L1 code unchanged when the first two chars are not numeric", () => {
    expect(getGroupL1("ABC")).toBe("ABC");
  });

  it("buckets L1 codes under 100 by their second digit (0X0)", () => {
    expect(getGroupL1("010")).toBe("010");
    expect(getGroupL1("051")).toBe("050");
    expect(getGroupL1("099")).toBe("090");
  });

  it("buckets L1 codes 100 and over by their leading digit (X00)", () => {
    expect(getGroupL1("101")).toBe("100");
    expect(getGroupL1("250")).toBe("200");
    expect(getGroupL1("601")).toBe("600");
    expect(getGroupL1("999")).toBe("900");
  });
});

describe("buildCbsTree", () => {
  it("groups items under their getGroupL1 bucket as the first level", () => {
    const tree = buildCbsTree([
      item({ id: 1, l1: "601" }),
      item({ id: 2, l1: "699" }),
      item({ id: 3, l1: "701" }),
    ]);
    expect(tree.map((n) => n.segment)).toEqual(["600", "700"]);
    const six = tree[0];
    expect(six.children.map((c) => c.segment).sort()).toEqual(["601", "699"]);
  });

  it("skips creating a child level when the bucket key already equals the L1 code", () => {
    // L1 "010" buckets to "010" itself — no extra child should be created.
    const tree = buildCbsTree([item({ id: 1, l1: "010" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].segment).toBe("010");
    expect(tree[0].item?.id).toBe(1);
    expect(tree[0].children).toHaveLength(0);
  });

  it("only descends levels until a LEVEL_DEFAULT ('00') segment is seen", () => {
    const tree = buildCbsTree([
      item({ id: 1, l1: "601", l2: "01", l3: "02", l4: "00", l5: "03" }),
    ]);
    // l4 = "00" stops descent, so l5 must NOT appear.
    const node = findByPath(tree, "600|601|01|02");
    expect(node).toBeDefined();
    expect(node?.item?.id).toBe(1);
    expect(findByPath(tree, "600|601|01|02|00")).toBeUndefined();
  });

  it("sorts children alphabetically at every level", () => {
    const tree = buildCbsTree([
      item({ id: 1, l1: "601", l2: "02" }),
      item({ id: 2, l1: "601", l2: "01" }),
      item({ id: 3, l1: "601", l2: "03" }),
    ]);
    const l1 = findByPath(tree, "600|601");
    expect(l1?.children.map((c) => c.segment)).toEqual(["01", "02", "03"]);
  });

  it("collects descendantItemIds across the whole subtree", () => {
    const tree = buildCbsTree([
      item({ id: 1, l1: "601", l2: "01" }),
      item({ id: 2, l1: "601", l2: "02" }),
      item({ id: 3, l1: "601", l2: "02", l3: "01" }),
    ]);
    const bucket = findByPath(tree, "600");
    expect(bucket?.descendantItemIds.sort()).toEqual([1, 2, 3]);
    const l201 = findByPath(tree, "600|601|02");
    expect(l201?.descendantItemIds.sort()).toEqual([2, 3]);
  });

  it("precomputes a lowercased searchHaystack from displayCode/name/description", () => {
    const tree = buildCbsTree([
      item({
        id: 1,
        l1: "601",
        displayCode: "601",
        name: "Piping Spool",
        accountDescription: "Carbon Steel",
      }),
    ]);
    const leaf = findByPath(tree, "600|601");
    expect(leaf?.searchHaystack).toBe("601 piping spool carbon steel");
  });

  it("subtreeHaystack contains text from descendants even if parent has no item", () => {
    const tree = buildCbsTree([
      item({
        id: 1,
        l1: "601",
        l2: "01",
        displayCode: "601-01",
        name: "Bolt-up",
        accountDescription: "",
      }),
    ]);
    const bucket = findByPath(tree, "600");
    expect(bucket?.searchHaystack).toBe("");
    expect(bucket?.subtreeHaystack).toContain("bolt-up");
  });

  it("keeps only the first item when two items collide on the same path", () => {
    const tree = buildCbsTree([
      item({ id: 7, l1: "601", name: "first" }),
      item({ id: 99, l1: "601", name: "second" }),
    ]);
    const leaf = findByPath(tree, "600|601");
    expect(leaf?.item?.id).toBe(7);
    expect(leaf?.descendantItemIds).toEqual([7]);
  });
});

describe("nodeMatchesSearch", () => {
  const tree = buildCbsTree([
    item({ id: 1, l1: "601", displayCode: "601", name: "Pipe Fab" }),
    item({ id: 2, l1: "701", displayCode: "701", name: "Conduit" }),
  ]);
  const sixHundred = tree.find((n) => n.segment === "600")!;
  const sevenHundred = tree.find((n) => n.segment === "700")!;

  it("matches everything when the query is empty", () => {
    expect(nodeMatchesSearch(sixHundred, "")).toBe(true);
  });

  it("matches when the lowercased query appears in the subtree haystack", () => {
    expect(nodeMatchesSearch(sixHundred, "pipe")).toBe(true);
    expect(nodeMatchesSearch(sevenHundred, "conduit")).toBe(true);
  });

  it("does not match when the query is absent from the subtree", () => {
    expect(nodeMatchesSearch(sixHundred, "conduit")).toBe(false);
  });
});

describe("filterCbsTree", () => {
  const tree = buildCbsTree([
    item({ id: 1, l1: "601", l2: "01", displayCode: "601-01", name: "Spool" }),
    item({ id: 2, l1: "601", l2: "02", displayCode: "601-02", name: "Bolt" }),
    item({ id: 3, l1: "701", l2: "01", displayCode: "701-01", name: "Wire" }),
  ]);

  it("returns the original nodes array by reference when the query is empty", () => {
    expect(filterCbsTree(tree, "")).toBe(tree);
  });

  it("prunes top-level subtrees that don't contain the query", () => {
    const filtered = filterCbsTree(tree, "wire");
    expect(filtered.map((n) => n.segment)).toEqual(["700"]);
  });

  it("preserves identity of a subtree whose own haystack matches", () => {
    // "spool" only matches the l2=01 leaf's own searchHaystack — its parent
    // (l1=601) only matches via descendants, so the parent must be a NEW
    // object while the matching leaf is kept verbatim.
    const filtered = filterCbsTree(tree, "spool");
    const filteredL1 = findByPath(filtered, "600|601")!;
    const originalL1 = findByPath(tree, "600|601")!;
    expect(filteredL1).not.toBe(originalL1);

    const filteredLeaf = findByPath(filtered, "600|601|01")!;
    const originalLeaf = findByPath(tree, "600|601|01")!;
    expect(filteredLeaf).toBe(originalLeaf);
  });

  it("recurses into descendant-only matches and only keeps matching children", () => {
    const filtered = filterCbsTree(tree, "bolt");
    const l1 = findByPath(filtered, "600|601")!;
    expect(l1.children.map((c) => c.segment)).toEqual(["02"]);
  });
});

describe("getNodeSelectionState", () => {
  const tree = buildCbsTree([
    item({ id: 1, l1: "601", l2: "01" }),
    item({ id: 2, l1: "601", l2: "02" }),
    item({ id: 3, l1: "601", l2: "03" }),
  ]);
  const bucket = findByPath(tree, "600|601")!;

  it("returns 'unchecked' when no descendants are selected", () => {
    expect(getNodeSelectionState(bucket, new Set())).toBe("unchecked");
  });

  it("returns 'checked' when every descendant is selected", () => {
    expect(getNodeSelectionState(bucket, new Set([1, 2, 3]))).toBe("checked");
  });

  it("returns 'indeterminate' when only some descendants are selected", () => {
    expect(getNodeSelectionState(bucket, new Set([1]))).toBe("indeterminate");
    expect(getNodeSelectionState(bucket, new Set([1, 2]))).toBe("indeterminate");
  });

  it("ignores selected ids that aren't descendants of this node", () => {
    expect(getNodeSelectionState(bucket, new Set([999]))).toBe("unchecked");
  });
});

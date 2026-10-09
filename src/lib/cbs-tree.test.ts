import { describe, expect, it } from "vitest";
import {
  buildCbsTree,
  CBS_FILTER_NONE,
  cbsAncestorCodes,
  cbsFilterIsEmpty,
  cbsIsMaterial,
  cbsIsSubcontract,
  collectExpandableKeys,
  collectKeysToLevel,
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
  selectionStateFromCounts,
  type CbsTreeItem,
  type CbsTreeNode,
  withCbsLevels,
} from "./cbs-tree";

/** A text-only filter — what every search test used before the type toggles. */
const text = (query: string) => ({ query, sub: false, material: false });

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
  const walk = (
    list: CbsTreeNode[],
    parent: string | null,
  ): string | null | undefined => {
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

  it("keeps 95X / 96X / 97X as their own divisions, not part of 900", () => {
    // Startup & Commissioning, Operations & Maintenance and Contingency each
    // have their own summary row beside Coatings & Insulation.
    expect(getGroupL1("950")).toBe("950");
    expect(getGroupL1("952")).toBe("950");
    expect(getGroupL1("959")).toBe("950");
    expect(getGroupL1("960")).toBe("960");
    expect(getGroupL1("967")).toBe("960");
    expect(getGroupL1("970")).toBe("970");
  });

  it("keeps 29X Grout as its own division, not part of 200 Concrete", () => {
    expect(getGroupL1("290")).toBe("290");
    expect(getGroupL1("291")).toBe("290");
    expect(getGroupL1("295")).toBe("290");
  });

  it("still folds the rest of the 900 block into Coatings", () => {
    expect(getGroupL1("900")).toBe("900");
    expect(getGroupL1("913")).toBe("900");
    // 990 is "Coatings & Insulation Subcontracts" — it really is part of 900.
    expect(getGroupL1("990")).toBe("900");
  });

  it("still folds Concrete's own accounts into 200", () => {
    expect(getGroupL1("200")).toBe("200");
    expect(getGroupL1("231")).toBe("200");
    expect(getGroupL1("240")).toBe("200");
    expect(getGroupL1("260")).toBe("200");
  });

  it("keeps the shop/field halves of one division together", () => {
    // 330 Steel Erection, 530 Equipment Installation and 630 Install Piping
    // share a division with their shop half.
    expect(getGroupL1("330")).toBe("300");
    expect(getGroupL1("530")).toBe("500");
    expect(getGroupL1("630")).toBe("600");
  });
});

/**
 * `cbsAncestorCodes` exists so a project-scoped subset can pull in the summary
 * rows above the codes it was granted. Its contract is that every code it
 * returns is one `buildCbsTree` would actually parent to, so the round-trip
 * test at the end of this block matters more than the literal expectations.
 */
describe("cbsAncestorCodes", () => {
  it("walks up the segments, then the division root", () => {
    expect(cbsAncestorCodes("052-10-0500-00-L")).toEqual([
      "052-10-0000-00-L",
      "052-10-0000-00-0",
      "052-00-0000-00-L",
      "052-00-0000-00-0",
      "050-00-0000-00-L",
      "050-00-0000-00-0",
    ]);
  });

  it("names the parent in the row's own cost type, not just the backbone", () => {
    // The workbook carries "Superintendents" as 052-15-0000-00-L and has no
    // 052-15-0000-00-0 at all, so asking only for the backbone found nothing
    // and the ticked children rendered beside their parent instead of under it.
    expect(cbsAncestorCodes("052-15-1000-00-L")).toContain("052-15-0000-00-L");
  });

  it("gives an L1 account just its division root", () => {
    expect(cbsAncestorCodes("601-00-0000-00-0")).toEqual(["600-00-0000-00-0"]);
  });

  it("returns nothing for a division root itself", () => {
    expect(cbsAncestorCodes("600-00-0000-00-0")).toEqual([]);
    // 290 and 950 are their own divisions, not children of 200 / 900.
    expect(cbsAncestorCodes("290-00-0000-00-0")).toEqual([]);
    expect(cbsAncestorCodes("950-00-0000-00-0")).toEqual([]);
  });

  it("hangs a division root's cost-type twin off the root", () => {
    expect(cbsAncestorCodes("600-00-0000-00-M")).toEqual(["600-00-0000-00-0"]);
  });

  it("ignores trailing markers, which are not levels", () => {
    // The Pipe Shop's -ST / -LB suffixes sit in L5 with L3/L4 still "00", so
    // they add no level and no ancestor of their own.
    expect(cbsAncestorCodes("601-05-0000-ST-L")).toEqual([
      "601-00-0000-00-L",
      "601-00-0000-00-0",
      "600-00-0000-00-L",
      "600-00-0000-00-0",
    ]);
  });

  it("names every code buildCbsTree would parent to, so a subset still nests", () => {
    // A granted subset with none of its parents — what Setup produces when a
    // user ticks leaves only.
    const granted = [
      "052-15-1000-00-L",
      "601-05-1000-00-L",
      "290-05-0000-00-0",
    ];
    // Only the codes that exist get fetched, so the fixture mirrors a workbook
    // that carries "Superintendents" in cost type L and no "-0" twin for it.
    const CATALOG = new Set([
      "050-00-0000-00-0",
      "052-00-0000-00-0",
      "052-15-0000-00-L",
      "600-00-0000-00-0",
      "601-00-0000-00-0",
      "601-05-0000-00-L",
      "290-00-0000-00-0",
    ]);
    const needed = [...new Set(granted.flatMap((c) => cbsAncestorCodes(c)))]
      .filter((c) => !granted.includes(c))
      .filter((c) => CATALOG.has(c));

    const tree = buildCbsTree([...granted, ...needed].map((c) => item(c)));

    // Every granted row hangs under its own division root, not at the top.
    expect(tree.map((n) => n.item.displayCode)).toEqual([
      "050-00-0000-00-0",
      "290-00-0000-00-0",
      "600-00-0000-00-0",
    ]);
    for (const code of granted) {
      expect(parentOf(tree, code)).not.toBeNull();
    }
    expect(parentOf(tree, "052-15-1000-00-L")).toBe("052-15-0000-00-L");
    expect(parentOf(tree, "601-05-1000-00-L")).toBe("601-05-0000-00-L");
    expect(parentOf(tree, "290-05-0000-00-0")).toBe("290-00-0000-00-0");
  });

  it("leaves nothing to add once the parents are already granted", () => {
    const granted = [
      "600-00-0000-00-0",
      "601-00-0000-00-0",
      "601-05-0000-00-0",
    ];
    const needed = granted
      .flatMap((c) => cbsAncestorCodes(c))
      .filter((c) => !granted.includes(c));
    expect(needed).toEqual([]);
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

  it("roots Grout beside Concrete, keeping Concrete's own accounts inside it", () => {
    const tree = buildCbsTree([
      item("200-00-0000-00-0", { name: "Concrete" }),
      item("240-00-0000-00-0", { name: "Cast in Place Concrete" }),
      item("290-00-0000-00-0", { name: "Grout" }),
      item("295-00-0000-00-0", { name: "Install Grout" }),
    ]);
    expect(tree.map((n) => n.item.displayCode)).toEqual([
      "200-00-0000-00-0",
      "290-00-0000-00-0",
    ]);
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "240-00-0000-00-0",
    ]);
    expect(parentOf(tree, "295-00-0000-00-0")).toBe("290-00-0000-00-0");
  });

  it("roots 950 / 960 / 970 beside 900 rather than inside it", () => {
    const tree = buildCbsTree([
      item("900-00-0000-00-0", { name: "Coatings & Insulation" }),
      item("913-00-0000-00-0", { name: "Refractory" }),
      item("990-00-0000-00-0", { name: "Coatings & Insulation Subcontracts" }),
      item("950-00-0000-00-0", { name: "Startup & Commissioning" }),
      item("952-00-0000-00-0", { name: "S&C Field Staff" }),
      item("960-00-0000-00-0", { name: "Operations & Maintenance" }),
      item("967-00-0000-00-0", { name: "Operations Training" }),
      item("970-00-0000-00-0", { name: "Contingency" }),
    ]);
    expect(tree.map((n) => n.item.displayCode)).toEqual([
      "900-00-0000-00-0",
      "950-00-0000-00-0",
      "960-00-0000-00-0",
      "970-00-0000-00-0",
    ]);
    // Coatings keeps its own accounts, including the subcontracts account.
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "913-00-0000-00-0",
      "990-00-0000-00-0",
    ]);
    // The new divisions carry their own children.
    expect(parentOf(tree, "952-00-0000-00-0")).toBe("950-00-0000-00-0");
    expect(parentOf(tree, "967-00-0000-00-0")).toBe("960-00-0000-00-0");
  });

  it("keeps a 0x0 group root that is its own L1 as a single node", () => {
    const tree = buildCbsTree([
      item("010-00-0000-00-0"),
      item("012-00-0000-00-0"),
    ]);
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
    expect(tree[0].descendantItemIds.sort()).toEqual(
      [a.id, b.id, c.id, d.id].sort(),
    );
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
    expect(tree[0].searchHaystack).toBe(
      "601-00-0000-00-0 piping spool carbon steel",
    );
  });

  it("finds a node via descendant text without storing it on the ancestor", () => {
    const tree = buildCbsTree([
      item("601-00-0000-00-0"),
      item("601-01-0000-00-0", { name: "Bolt-up" }),
    ]);
    expect(tree[0].searchHaystack).not.toContain("bolt-up");
    expect(filterCbsTree(tree, text("bolt-up"))).toHaveLength(1);
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

describe("cbsFlagBadges", () => {
  const labels = (over: Partial<CbsTreeItem>) =>
    cbsFlagBadges(item("601-05-0000-00-0", over)).map((b) => b.label);

  it("badges the workbook's Sub Code and Material Code flags", () => {
    expect(labels({ subReporting: true, materialCode: false })).toEqual(["S"]);
    expect(labels({ subReporting: false, materialCode: true })).toEqual(["M"]);
  });

  it("shows both when a row carries both flags", () => {
    expect(labels({ subReporting: true, materialCode: true })).toEqual([
      "S",
      "M",
    ]);
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
  it("badges a generated row by what it is", () => {
    expect(
      cbsRowTypeBadges(item("601-05-0000-00-S", { rowType: "SUB" })),
    ).toEqual([{ label: "S", title: "Generated sub-code row" }]);
    expect(
      cbsRowTypeBadges(item("601-05-0000-00-M", { rowType: "MATERIAL" })),
    ).toEqual([{ label: "M", title: "Generated material row" }]);
  });

  it("badges an original row with nothing", () => {
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
    expect(filterCbsTree(tree, text(""))).toBe(tree);
  });

  it("prunes top-level subtrees that don't contain the query", () => {
    const filtered = filterCbsTree(tree, text("wire"));
    expect(filtered.map((n) => n.item.name)).toEqual(["Wire"]);
  });

  it("preserves identity of a subtree whose own haystack matches", () => {
    // "spool" matches 601's own haystack, so 601 is kept verbatim (with its
    // non-matching child) while its parent 600 is a new object.
    const filtered = filterCbsTree(tree, text("spool"));
    expect(filtered[0]).not.toBe(tree[0]);
    expect(filtered[0].children[0]).toBe(tree[0].children[0]);
    expect(filtered[0].children[0].children).toHaveLength(1);
  });

  it("recurses into descendant-only matches and only keeps matching children", () => {
    const filtered = filterCbsTree(tree, text("bolt"));
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
    const { nodes, matches } = pruneCbsTree(tree, text("spool"));
    expect(matches).toBe(1);
    expect(nodes[0].item.name).toBe("Pipe");
    expect(nodes[0].children[0].item.name).toBe("Spool");
    expect(nodes[0].children[0].children).toHaveLength(0);
  });

  it("counts every self-match", () => {
    expect(pruneCbsTree(tree, text("601")).matches).toBe(3);
  });
});

/**
 * `withCbsLevels` restores the l1-l6 segments the wire omits. It is the one
 * place that reconstruction happens, so a slice being off by one would put
 * every row in the wrong branch of every tree.
 */
describe("withCbsLevels", () => {
  it("rebuilds the segments the server no longer sends", () => {
    expect(
      withCbsLevels({ displayCode: "052-15-0500-00-L", name: "Supers" }),
    ).toEqual({
      displayCode: "052-15-0500-00-L",
      name: "Supers",
      l1: "052",
      l2: "15",
      l3: "05",
      l4: "00",
      l5: "00",
      l6: "L",
    });
  });

  it("agrees with the parse the tree itself uses", () => {
    for (const code of [
      "100-00-0000-00-0",
      "052-15-0500-00-L",
      "601-05-0000-ST-L",
      "600-00-0000-00-M",
      "970-00-0000-00-0",
    ]) {
      const { displayCode, ...levels } = withCbsLevels({ displayCode: code });
      expect(levels).toEqual(parseCbsDisplayCode(code));
    }
  });

  it("keeps the row's other fields, flags included", () => {
    const row = withCbsLevels({
      displayCode: "100-00-0000-00-0",
      id: 7,
      subReporting: true,
      context: true,
    });
    expect(row).toMatchObject({ id: 7, subReporting: true, context: true });
  });
});

describe("cbsIsSubcontract / cbsIsMaterial", () => {
  it("matches a row by its own cost type", () => {
    // The workbook ships some S/M rows itself; the dictionary generates the
    // rest. Both land in l6, so neither needs special-casing.
    expect(cbsIsSubcontract(item("052-00-0000-00-S"))).toBe(true);
    expect(cbsIsMaterial(item("101-00-0000-00-M"))).toBe(true);
    expect(cbsIsSubcontract(item("101-00-0000-00-M"))).toBe(false);
    expect(cbsIsMaterial(item("052-00-0000-00-S"))).toBe(false);
  });

  it("matches a row by its Sub Code / Material Code flag", () => {
    const flagged = item("101-00-0000-00-0", {
      subReporting: true,
      materialCode: true,
    });
    expect(cbsIsSubcontract(flagged)).toBe(true);
    expect(cbsIsMaterial(flagged)).toBe(true);
  });

  it("is false for a plain row, blank flags included", () => {
    const plain = item("101-00-0000-00-L", {
      subReporting: null,
      materialCode: false,
    });
    expect(cbsIsSubcontract(plain)).toBe(false);
    expect(cbsIsMaterial(plain)).toBe(false);
  });
});

/**
 * The toolbar's Subcontracts / Materials toggles. They narrow the text query
 * and widen each other, and they always prune strictly — even on Setup, where
 * a text match would otherwise keep its whole subtree.
 */
describe("row-type filters", () => {
  const tree = () =>
    buildCbsTree([
      item("600-00-0000-00-0", { name: "Piping" }),
      item("601-00-0000-00-0", {
        name: "Pipe Spool",
        subReporting: true,
        materialCode: false,
      }),
      item("601-00-0000-00-S", { name: "Pipe Spool Subcontracts" }),
      item("601-05-0000-00-0", {
        name: "Bolt-up",
        subReporting: false,
        materialCode: true,
      }),
      item("601-10-0000-00-0", { name: "Hydrotest" }),
    ]);

  const names = (nodes: CbsTreeNode[]): string[] => {
    const out: string[] = [];
    const walk = (list: CbsTreeNode[]) => {
      for (const n of list) {
        out.push(n.item.name);
        walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };

  it("keeps subcontract rows and their ancestors, and nothing else", () => {
    const { nodes, matches } = pruneCbsTree(tree(), {
      query: "",
      sub: true,
      material: false,
    });
    // Piping is an ancestor, not a match; Hydrotest and Bolt-up are gone.
    expect(names(nodes)).toEqual([
      "Piping",
      "Pipe Spool",
      "Pipe Spool Subcontracts",
    ]);
    expect(matches).toBe(2);
  });

  it("keeps material rows the same way", () => {
    const { nodes, matches } = pruneCbsTree(tree(), {
      query: "",
      sub: false,
      material: true,
    });
    // Pipe Spool survives as Bolt-up's parent, not as a match of its own.
    expect(names(nodes)).toEqual(["Piping", "Pipe Spool", "Bolt-up"]);
    expect(matches).toBe(1);
  });

  it("asking for both means either", () => {
    const { nodes } = pruneCbsTree(tree(), {
      query: "",
      sub: true,
      material: true,
    });
    // The S twin is a sibling of Pipe Spool under Piping, so it comes after
    // Pipe Spool's own children in pre-order.
    expect(names(nodes)).toEqual([
      "Piping",
      "Pipe Spool",
      "Bolt-up",
      "Pipe Spool Subcontracts",
    ]);
  });

  it("narrows the text query rather than widening it", () => {
    const { nodes } = pruneCbsTree(tree(), {
      query: "bolt",
      sub: true,
      material: false,
    });
    // "Bolt-up" matches the text but is a material row, not a subcontract one.
    expect(names(nodes)).toEqual([]);
  });

  it("prunes strictly in filterCbsTree too, despite the matched-subtree rule", () => {
    // "Pipe Spool" carries Sub Code YES and has children. A text match would
    // keep that whole subtree; the type filter must not, or Setup would show
    // the catalog back again.
    const subOnly = filterCbsTree(tree(), {
      query: "",
      sub: true,
      material: false,
    });
    expect(names(subOnly)).toEqual([
      "Piping",
      "Pipe Spool",
      "Pipe Spool Subcontracts",
    ]);

    const textOnly = filterCbsTree(tree(), text("pipe spool"));
    expect(names(textOnly)).toContain("Bolt-up");
  });

  it("returns the original nodes array when nothing is filtering", () => {
    const t = tree();
    expect(filterCbsTree(t, CBS_FILTER_NONE)).toBe(t);
    expect(pruneCbsTree(t, CBS_FILTER_NONE).nodes).toBe(t);
    expect(cbsFilterIsEmpty(CBS_FILTER_NONE)).toBe(true);
    expect(cbsFilterIsEmpty({ query: "", sub: true, material: false })).toBe(
      false,
    );
  });
});

describe("collectKeysToLevel", () => {
  // 050 root → 052 account → 052-15 → two leaves, i.e. code levels 0..3.
  const tree = () =>
    buildCbsTree([
      item("050-00-0000-00-0", { name: "Field Indirects" }),
      item("052-00-0000-00-0", { name: "Field Staff" }),
      item("052-15-0000-00-L", { name: "Superintendents" }),
      item("052-15-1000-00-L", { name: "Superintendents - Civil" }),
      item("052-15-3000-00-L", { name: "Superintendents - Ironworker" }),
    ]);

  /** The rows a user would see with exactly `keys` open. */
  function visible(nodes: CbsTreeNode[], keys: string[]): string[] {
    const open = new Set(keys);
    const out: string[] = [];
    const walk = (list: CbsTreeNode[]) => {
      for (const n of list) {
        out.push(n.item.displayCode);
        if (open.has(n.pathKey)) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  }

  it("opens nothing at level 0, which is collapse-all", () => {
    const t = tree();
    expect(collectKeysToLevel(t, 0)).toEqual([]);
    expect(visible(t, [])).toEqual(["050-00-0000-00-0"]);
  });

  it("reveals one more code level per step", () => {
    const t = tree();
    expect(visible(t, collectKeysToLevel(t, 1))).toEqual([
      "050-00-0000-00-0",
      "052-00-0000-00-0",
    ]);
    expect(visible(t, collectKeysToLevel(t, 2))).toEqual([
      "050-00-0000-00-0",
      "052-00-0000-00-0",
      "052-15-0000-00-L",
    ]);
    expect(visible(t, collectKeysToLevel(t, 3))).toEqual([
      "050-00-0000-00-0",
      "052-00-0000-00-0",
      "052-15-0000-00-L",
      "052-15-1000-00-L",
      "052-15-3000-00-L",
    ]);
  });

  it("matches Expand all once the level passes the deepest code", () => {
    // The legend's last swatch has to actually mean "everything", or a level
    // of the hierarchy would be unreachable from it.
    const t = tree();
    expect(collectKeysToLevel(t, 5).sort()).toEqual(
      collectExpandableKeys(t).sort(),
    );
  });

  it("keeps a row whose own level jumped past the target", () => {
    // 601-05-1000 is level 3 but its parent is level 1, because the workbook
    // has no 601-05 summary. Opening to level 2 still shows it — there is no
    // intermediate row to stop at, and hiding it would hide the branch.
    const t = buildCbsTree([
      item("600-00-0000-00-0"),
      item("601-00-0000-00-0"),
      item("601-05-1000-00-L"),
    ]);
    expect(visible(t, collectKeysToLevel(t, 2))).toContain("601-05-1000-00-L");
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

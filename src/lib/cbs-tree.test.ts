import { describe, expect, it } from "vitest";
import {
  stripCostTypeSuffix,
  costTypeSuffixOf,
  buildCbsTree,
  CBS_FILTER_NONE,
  type CbsRowFilter,
  cbsAncestorCodes,
  CBS_NO_CLASSIFICATION,
  cbsValueFilterOptions,
  CBS_BLANK_VALUE,
  cbsFilterIsEmpty,
  CBS_COST_TYPES,
  cbsHasCostType,
  cbsIsCostType,
  cbsIsActive,
  cbsIsBackbone,
  cbsQueryTokens,
  cbsIsBackboneCode,
  collectExpandableKeys,
  collectKeysToLevel,
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
const text = (query: string): CbsRowFilter => ({ ...CBS_FILTER_NONE, query });

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

  it("roots the whole 9-series beside 900 after the Specialty Services shift", () => {
    // Inserting 950 Specialty Services pushed Startup & Commissioning to 960,
    // Operations & Maintenance to 970 and Contingency to 980. Each is its own
    // division, not an account inside Coatings & Insulation.
    const tree = buildCbsTree([
      item("900-00-0000-00-0", { name: "Coatings & Insulation" }),
      item("901-00-0000-00-0", { name: "Coatings Materials" }),
      item("950-00-0000-00-0", { name: "Specialty Services" }),
      item("951-00-0000-00-0", { name: "Mechanical Services" }),
      item("960-00-0000-00-0", { name: "Startup & Commissioning" }),
      item("962-00-0000-00-0", { name: "Startup Field Staff" }),
      item("970-00-0000-00-0", { name: "Operations & Maintenance" }),
      item("972-00-0000-00-0", { name: "Operations Field Staff" }),
      item("980-00-0000-00-0", { name: "Contingency" }),
    ]);
    expect(tree.map((n) => n.item.name)).toEqual([
      "Coatings & Insulation",
      "Specialty Services",
      "Startup & Commissioning",
      "Operations & Maintenance",
      "Contingency",
    ]);
    // Each keeps its own accounts; none of them leaks into 900.
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "901-00-0000-00-0",
    ]);
    expect(parentOf(tree, "951-00-0000-00-0")).toBe("950-00-0000-00-0");
    expect(parentOf(tree, "962-00-0000-00-0")).toBe("960-00-0000-00-0");
    expect(parentOf(tree, "972-00-0000-00-0")).toBe("970-00-0000-00-0");
  });

  it("keeps 93X inside Coatings & Insulation", () => {
    // Deliberately NOT a tens division: Paint & Coatings reads as part of
    // Coatings & Insulation. Pinned so the 9-series shift doesn't sweep it up.
    const tree = buildCbsTree([
      item("900-00-0000-00-0", { name: "Coatings & Insulation" }),
      item("930-00-0000-00-0", { name: "Paint & Coatings" }),
    ]);
    expect(tree.map((n) => n.item.name)).toEqual(["Coatings & Insulation"]);
    expect(parentOf(tree, "930-00-0000-00-0")).toBe("900-00-0000-00-0");
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

  it("nests every cost type under its own roll-up row", () => {
    // "0" is the account's roll-up code, so its priced variants are its
    // children. 101's M twin belongs under 101's own "-0" row, not beside it
    // under the 100 root.
    const tree = buildCbsTree([
      item("100-00-0000-00-0"),
      item("100-00-0000-00-S"),
      item("100-00-0000-00-M"),
      item("101-00-0000-00-0"),
      item("101-00-0000-00-M"),
    ]);
    expect(tree[0].children.map((c) => c.item.displayCode)).toEqual([
      "100-00-0000-00-S",
      "100-00-0000-00-M",
      "101-00-0000-00-0",
    ]);
    expect(parentOf(tree, "101-00-0000-00-M")).toBe("101-00-0000-00-0");
    // The root's own twins still hang off the root, which IS their roll-up.
    expect(parentOf(tree, "100-00-0000-00-S")).toBe("100-00-0000-00-0");
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
    // Its own roll-up row wins over any same-type ancestor.
    expect(parentOf(tree, "101-05-0000-00-M")).toBe("101-05-0000-00-0");
    // No roll-up at 101-05-0500 → the same-type ancestor walk takes over.
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
    expect(node.level).toBe(4); // color still reflects the code depth
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
    // The code appears twice — as written and dashless — so a cost code
    // pasted out of Excel ("601000000000") finds its row. UOM is included so
    // "tn" finds the tonnage codes. Empty fields contribute nothing.
    expect(tree[0].searchHaystack).toBe(
      "601-00-0000-00-0 601000000000 piping spool carbon steel",
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

describe("cbsIsBackbone", () => {
  it('accepts only the account\'s own "-0" row', () => {
    expect(cbsIsBackbone(item("012-05-1000-00-0"))).toBe(true);
    for (const t of ["L", "S", "M", "E", "O", "D", "P", "Y"]) {
      expect(cbsIsBackbone(item(`012-05-1000-00-${t}`))).toBe(false);
    }
  });

  it("answers the same from a bare display code", () => {
    // Wire rows travel without the level segments, so the export filters on
    // the code itself; the two must not drift apart.
    for (const code of [
      "012-05-1000-00-0",
      "012-05-1000-00-L",
      "601-05-0000-ST-L",
      "000-00-0000-00-0",
    ]) {
      expect(cbsIsBackboneCode(code)).toBe(cbsIsBackbone(item(code)));
    }
  });
});

describe("search terms", () => {
  const tree = () =>
    buildCbsTree([
      item("604-00-0000-00-0", { name: "Pipe Shop Equipment" }),
      item("604-20-0000-00-0", {
        name: "Pipe Shop Third Party Rental",
        uom: "DAY",
      }),
      item("604-30-0000-00-0", { name: "Steel Erection", uom: "TN" }),
    ]);
  const names = (nodes: CbsTreeNode[]): string[] => {
    const out: string[] = [];
    const walk = (l: CbsTreeNode[]) => {
      for (const n of l) {
        out.push(n.item.name);
        walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };
  const find = (q: string) =>
    names(pruneCbsTree(tree(), { ...CBS_FILTER_NONE, query: q }).nodes);

  it("matches terms in any order", () => {
    // One substring over the whole haystack would miss this: nobody types an
    // account's words in the order the workbook happens to have them.
    expect(find("rental pipe")).toContain("Pipe Shop Third Party Rental");
  });

  it("requires every term, so a second word narrows", () => {
    expect(find("pipe shop")).toContain("Pipe Shop Third Party Rental");
    expect(find("pipe erection")).toEqual([]);
  });

  it("finds a code pasted without its dashes", () => {
    // Cost codes travel dashless — the workbook's Cost Code column, exports,
    // anything copied out of Excel.
    expect(find("604200000000")).toContain("Pipe Shop Third Party Rental");
    expect(find("60420")).toContain("Pipe Shop Third Party Rental");
  });

  it("still matches the code as written", () => {
    expect(find("604-20")).toContain("Pipe Shop Third Party Rental");
  });

  it("searches the unit of measure", () => {
    expect(find("tn")).toContain("Steel Erection");
  });

  it("ignores stray whitespace", () => {
    expect(find("  pipe   rental  ")).toContain("Pipe Shop Third Party Rental");
  });
});

describe("cbsQueryTokens", () => {
  it("splits on whitespace and drops the empties", () => {
    expect(cbsQueryTokens("  Pipe   Rental ")).toEqual(["pipe", "rental"]);
    expect(cbsQueryTokens("   ")).toEqual([]);
  });
});

describe("cbsIsActive", () => {
  it("accepts Active in whatever case or padding the workbook used", () => {
    for (const s of ["Active", "active", "ACTIVE", " Active "]) {
      expect(cbsIsActive(s)).toBe(true);
    }
  });

  it("treats a blank Status as active", () => {
    // ~190 ordinary accounts have an empty Status cell, section summaries
    // among them. Reading blank as retired would hide live codes and strand
    // their children, so an empty cell is a gap, not a decision.
    for (const s of [null, undefined, "", "   "]) {
      expect(cbsIsActive(s)).toBe(true);
    }
  });

  it("rejects Inactive and anything else that is not Active", () => {
    // "Retired" is not a status the workbook uses today; it must hide itself
    // if someone adds it, rather than quietly showing up as live.
    for (const s of ["Inactive", "inactive", "Retired", "Superseded"]) {
      expect(cbsIsActive(s)).toBe(false);
    }
  });
});

describe("status filter", () => {
  const tree = () =>
    buildCbsTree([
      item("600-00-0000-00-0", { name: "Piping", status: "Active" }),
      item("601-00-0000-00-0", { name: "Spool", status: "Active" }),
      item("601-05-0000-00-0", { name: "Hot Tap", status: "Inactive" }),
      item("601-10-0000-00-0", { name: "Blank", status: null }),
      item("601-15-0000-00-0", { name: "Old", status: "Retired" }),
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

  it("matches a blank Status under Active", () => {
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      active: true,
    });
    expect(names(nodes).sort()).toEqual(["Blank", "Piping", "Spool"]);
  });

  it("picks out Inactive and Retired separately", () => {
    expect(
      names(pruneCbsTree(tree(), { ...CBS_FILTER_NONE, inactive: true }).nodes),
    ).toEqual(["Hot Tap"]);
    expect(
      names(pruneCbsTree(tree(), { ...CBS_FILTER_NONE, retired: true }).nodes),
    ).toEqual(["Old"]);
  });

  it("asking for two statuses means either", () => {
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      inactive: true,
      retired: true,
    });
    expect(names(nodes).sort()).toEqual(["Hot Tap", "Old"]);
  });

  it("drops ancestors that do not carry the status, like the type filter", () => {
    // "Piping" and "Spool" are Active, so under an Inactive filter they go
    // even though Hot Tap hangs beneath them.
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      inactive: true,
    });
    expect(nodes.map((n) => [n.item.name, n.depth])).toEqual([["Hot Tap", 0]]);
  });

  it("narrows against the cost-type toggles rather than widening", () => {
    // Hot Tap is Inactive but carries no Sub Code, so the pair matches nothing.
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      inactive: true,
      sub: true,
    });
    expect(names(nodes)).toEqual([]);
  });

  it("counts as filtering, so an all-off filter still short-circuits", () => {
    expect(cbsFilterIsEmpty(CBS_FILTER_NONE)).toBe(true);
    expect(cbsFilterIsEmpty({ ...CBS_FILTER_NONE, inactive: true })).toBe(
      false,
    );
  });
});

describe("cbsHasCostType", () => {
  it("covers the six workbook cost types, in column order", () => {
    expect(CBS_COST_TYPES.map((t) => t.code)).toEqual([
      "L",
      "S",
      "M",
      "E",
      "O",
      "R",
    ]);
    expect(CBS_COST_TYPES.map((t) => t.flag)).toEqual([
      "laborCode",
      "subReporting",
      "materialCode",
      "equipmentCode",
      "otherCode",
      "rentalCode",
    ]);
    // Each reads its own workbook column.
    expect(CBS_COST_TYPES.find((t) => t.code === "R")).toMatchObject({
      key: "rental",
      label: "Rental",
      column: "Rental Code",
    });
  });

  it("matches a row by its own cost type", () => {
    // The workbook ships some typed rows itself; the dictionary generates the
    // rest. Both land in l6, so neither needs special-casing.
    for (const t of CBS_COST_TYPES) {
      const row = item(`101-00-0000-00-${t.code}`);
      expect(cbsHasCostType(row, t)).toBe(true);
      // ...and no OTHER type claims it.
      for (const other of CBS_COST_TYPES.filter((x) => x.key !== t.key)) {
        expect(cbsHasCostType(row, other)).toBe(false);
      }
    }
  });

  it("matches a row by its flag column", () => {
    for (const t of CBS_COST_TYPES) {
      const flagged = item("101-00-0000-00-0", { [t.flag]: true });
      expect(cbsHasCostType(flagged, t)).toBe(true);
    }
  });

  it("is false for a plain row, blank flags included", () => {
    const plain = item("101-00-0000-00-D", {
      subReporting: null,
      materialCode: false,
      laborCode: null,
      equipmentCode: false,
      otherCode: null,
    });
    for (const t of CBS_COST_TYPES)
      expect(cbsHasCostType(plain, t)).toBe(false);
  });
});

/**
 * The toolbar's cost-type toggles. A row qualifies on its own code alone — the
 * flag columns below are set to show they are NOT read. The toggles narrow the
 * text query and widen each other, and they always prune strictly — even on
 * Setup, where a text match would otherwise keep its whole subtree.
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
      item("601-05-0000-00-M", {
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

  it("keeps subcontract rows ONLY, dropping ancestors that aren't", () => {
    const { nodes, matches } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      query: "",
      sub: true,
      material: false,
    });
    // Only the "-S" line is a subcontract code. "Pipe Spool" goes despite its
    // Sub Code YES — that flag is the account's, not this line's — and so does
    // "Piping", though both are its ancestors: a row kept for structure would
    // read as a subcontract code that is not one. The match is lifted into
    // their place rather than disappearing with them.
    expect(names(nodes)).toEqual(["Pipe Spool Subcontracts"]);
    expect(matches).toBe(1);
  });

  it("promotes a match whose parent was dropped", () => {
    const { nodes, matches } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      query: "",
      sub: false,
      material: true,
    });
    // Bolt-up is the only "-M" line. BOTH rows above it — Piping and Pipe
    // Spool — are roll-ups, so it ends up at the top level on its own.
    expect(names(nodes)).toEqual(["Bolt-up"]);
    expect(matches).toBe(1);
  });

  it("re-depths promoted rows so they don't indent under a dropped parent", () => {
    // `depth` drives indentation. Bolt-up sits at depth 2 unfiltered; with its
    // two ancestors dropped it must render flush left, not indented into the
    // gap they left.
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      query: "",
      material: true,
    });
    expect(nodes.map((n) => [n.item.name, n.depth])).toEqual([["Bolt-up", 0]]);
    // `level` is the CODE's level and still drives the color, so it does NOT
    // move — a filter must not repaint the row.
    expect(nodes[0].level).toBe(2);
  });

  it("asking for both means either", () => {
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      query: "",
      sub: true,
      material: true,
    });
    // The two typed lines, and neither roll-up above them.
    expect(names(nodes)).toEqual(["Pipe Spool Subcontracts", "Bolt-up"]);
  });

  it("narrows the text query rather than widening it", () => {
    const { nodes } = pruneCbsTree(tree(), {
      ...CBS_FILTER_NONE,
      query: "bolt",
      sub: true,
      material: false,
    });
    // "Bolt-up" matches the text but is a material row, not a subcontract one.
    expect(names(nodes)).toEqual([]);
  });

  it("prunes strictly in filterCbsTree too, despite the matched-subtree rule", () => {
    // "Pipe Spool" has children. A text match would keep that whole subtree;
    // the type filter must not, or Setup would show the catalog back again.
    const subOnly = filterCbsTree(tree(), {
      ...CBS_FILTER_NONE,
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
    expect(
      cbsFilterIsEmpty({
        ...CBS_FILTER_NONE,
        query: "",
        sub: true,
        material: false,
      }),
    ).toBe(false);
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

/**
 * The two readings of a cost-type filter.
 *
 * The workbook ships pre-expanded: an account's L / S / M rows are separate
 * rows that all carry the SAME flag columns, because the flags describe the
 * account. So a list of cost lines cannot read the flags — an account's "-S"
 * row would answer YES to "is this a Material code?" purely because the
 * account has one somewhere.
 */
describe("pruneCbsTree cost-type matching", () => {
  // One account with every variant the workbook would ship for it. The flags
  // are on all of them, which is what makes the two readings diverge.
  const flags = { laborCode: true, subReporting: true, materialCode: true };
  const tree = () =>
    buildCbsTree([
      item("601-00-0000-00-0", { name: "Account", ...flags }),
      item("601-00-0000-00-L", { name: "Account Labor", ...flags }),
      item("601-00-0000-00-S", { name: "Account Subcontracts", ...flags }),
      item("601-00-0000-00-M", { name: "Account Materials", ...flags }),
    ]);

  const kept = (over: Partial<CbsRowFilter>) => {
    const out: string[] = [];
    const walk = (nodes: ReturnType<typeof buildCbsTree>) => {
      for (const n of nodes) {
        out.push(n.item.displayCode);
        walk(n.children);
      }
    };
    walk(pruneCbsTree(tree(), { ...CBS_FILTER_NONE, ...over }).nodes);
    return out;
  };

  it("keeps only the M row when a cost-line list filters on Materials", () => {
    // What the Dictionary needs. The "-S" row is the one that used to leak.
    expect(kept({ material: true })).toEqual(["601-00-0000-00-M"]);
  });

  it("keeps only the S row when filtering on Subcontracts", () => {
    expect(kept({ sub: true })).toEqual(["601-00-0000-00-S"]);
  });

  it("asking for two cost types keeps both and nothing else", () => {
    expect(kept({ sub: true, material: true })).toEqual([
      "601-00-0000-00-S",
      "601-00-0000-00-M",
    ]);
  });

  it("drops the roll-up row, whose own cost type is 0", () => {
    // It is the parent of the M row, but a filter asking for Material codes
    // should not answer with a code that is not one — the same rule the other
    // views already follow for ungranted parents.
    expect(kept({ material: true })).not.toContain("601-00-0000-00-0");
  });

  it("leaves a text search alone", () => {
    // Cost types are strict; a query still keeps ancestors.
    expect(kept({ query: "subcontracts" })).toContain("601-00-0000-00-S");
  });
});

describe("cbsHasCostType", () => {
  const M = CBS_COST_TYPES.find((t) => t.key === "material")!;

  it("says yes to a row that IS the cost type, either way it is asked", () => {
    const row = item("601-00-0000-00-M", { materialCode: false });
    expect(cbsIsCostType(row, M)).toBe(true);
    expect(cbsHasCostType(row, M)).toBe(true);
  });

  it("reads the flag only when asking what the account carries", () => {
    // The trees filter with cbsIsCostType; the export's YES columns use
    // cbsHasCostType.
    const row = item("601-00-0000-00-S", { materialCode: true });
    expect(cbsIsCostType(row, M)).toBe(false);
    expect(cbsHasCostType(row, M)).toBe(true);
  });
});

describe("stripCostTypeSuffix / costTypeSuffixOf", () => {
  it("separates the workbook's cost-type marker from the name", () => {
    expect(stripCostTypeSuffix("Executive (L)")).toBe("Executive");
    expect(stripCostTypeSuffix("Overhead (*)")).toBe("Overhead");
    expect(stripCostTypeSuffix("Specialty Services  (*) ")).toBe(
      "Specialty Services",
    );
    expect(costTypeSuffixOf("Executive (L)")).toBe(" (L)");
    expect(costTypeSuffixOf("Specialty Services  (*) ")).toBe(" (*)");
  });

  it("leaves a name that only looks parenthesized alone", () => {
    // Only a one-letter or "*" marker at the very end is a cost type.
    expect(stripCostTypeSuffix("Hot Tap (reserved)")).toBe(
      "Hot Tap (reserved)",
    );
    expect(stripCostTypeSuffix("Pipe (L) Rack")).toBe("Pipe (L) Rack");
    expect(costTypeSuffixOf("Hot Tap (reserved)")).toBe("");
  });

  it("never empties a name that is nothing but a marker", () => {
    expect(stripCostTypeSuffix("(*)")).toBe("(*)");
  });
});

describe("cost classification filter", () => {
  const ROWS = [
    item("100-00-0000-00-0", { name: "Civil", costClassification: null }),
    item("100-10-0000-00-0", { name: "Site", costClassification: "INDIRECT" }),
    item("100-10-0500-00-L", {
      name: "Site Labor",
      costClassification: "DIRECT LABOR",
    }),
    item("100-10-0600-00-L", {
      name: "Fencing Labor",
      costClassification: " DIRECT LABOR ",
    }),
  ];
  const names = (nodes: CbsTreeNode[]): string[] =>
    nodes.flatMap((n) => [n.item.name, ...names(n.children)]);
  const by = (...classifications: string[]): CbsRowFilter => ({
    ...CBS_FILTER_NONE,
    classifications,
  });

  it("is empty until a classification is picked", () => {
    expect(cbsFilterIsEmpty(by())).toBe(true);
    expect(cbsFilterIsEmpty(by("INDIRECT"))).toBe(false);
    // Picking the blank entry is still a filter.
    expect(cbsFilterIsEmpty(by(CBS_NO_CLASSIFICATION))).toBe(false);
  });

  it("keeps rows of any classification picked", () => {
    const { nodes, matches } = pruneCbsTree(
      buildCbsTree(ROWS),
      by("INDIRECT", CBS_NO_CLASSIFICATION),
    );
    expect(names(nodes)).toEqual(["Civil", "Site"]);
    expect(matches).toBe(2);
  });

  it("lists each value with its count, trimmed, blank last", () => {
    expect(cbsValueFilterOptions(ROWS).classifications).toEqual([
      { value: "DIRECT LABOR", count: 2 },
      { value: "INDIRECT", count: 1 },
      { value: CBS_NO_CLASSIFICATION, count: 1 },
    ]);
  });

  it("leaves context rows out of the options", () => {
    const rows = [
      {
        ...item("200-00-0000-00-0", { costClassification: "INDIRECT" }),
        context: true,
      },
      item("200-10-0000-00-L", { costClassification: "DIRECT LABOR" }),
    ];
    expect(cbsValueFilterOptions(rows).classifications).toEqual([
      { value: "DIRECT LABOR", count: 1 },
    ]);
  });

  it("keeps only rows of that classification, dropping parents that are not", () => {
    const { nodes, matches } = pruneCbsTree(
      buildCbsTree(ROWS),
      by("DIRECT LABOR"),
    );
    expect(names(nodes)).toEqual(["Site Labor", "Fencing Labor"]);
    expect(matches).toBe(2);
  });

  it("matches blank cells with the blank entry", () => {
    const { nodes } = pruneCbsTree(
      buildCbsTree(ROWS),
      by(CBS_NO_CLASSIFICATION),
    );
    expect(names(nodes)).toEqual(["Civil"]);
  });

  it("does not let a matching parent carry its children through on Setup", () => {
    // Setup keeps a matching node's subtree under a text search; under a
    // classification filter that would list DIRECT LABOR rows as INDIRECT.
    const kept = names(filterCbsTree(buildCbsTree(ROWS), by("INDIRECT")));
    expect(kept).toContain("Site");
    expect(kept).not.toContain("Site Labor");
  });
});

describe("discipline filter", () => {
  const ROWS = [
    item("100-00-0000-00-0", { name: "Civil", discipline: "Civil" }),
    item("100-10-0000-00-0", { name: "Site", discipline: " Civil " }),
    item("100-10-0500-00-L", { name: "Site Labor", discipline: "Civil" }),
    item("600-00-0000-00-0", { name: "Piping", discipline: "Piping" }),
    item("600-05-0000-00-M", { name: "Pipe Materials", discipline: null }),
  ];
  const names = (nodes: CbsTreeNode[]): string[] =>
    nodes.flatMap((n) => [n.item.name, ...names(n.children)]);
  const by = (...disciplines: string[]): CbsRowFilter => ({
    ...CBS_FILTER_NONE,
    disciplines,
  });

  it("offers each discipline with its count, trimmed, blank last", () => {
    expect(cbsValueFilterOptions(ROWS).disciplines).toEqual([
      { value: "Civil", count: 3 },
      { value: "Piping", count: 1 },
      { value: CBS_BLANK_VALUE, count: 1 },
    ]);
  });

  it("is empty until a discipline is picked", () => {
    expect(cbsFilterIsEmpty(by())).toBe(true);
    expect(cbsFilterIsEmpty(by("Civil"))).toBe(false);
    expect(cbsFilterIsEmpty(by(CBS_BLANK_VALUE))).toBe(false);
  });

  it("keeps only rows of the disciplines picked", () => {
    const { nodes, matches } = pruneCbsTree(buildCbsTree(ROWS), by("Civil"));
    expect(names(nodes)).toEqual(["Civil", "Site", "Site Labor"]);
    expect(matches).toBe(3);
    expect(
      names(pruneCbsTree(buildCbsTree(ROWS), by(CBS_BLANK_VALUE)).nodes),
    ).toEqual(["Pipe Materials"]);
  });

  it("narrows the other filters rather than widening them", () => {
    const shown = names(
      pruneCbsTree(buildCbsTree(ROWS), { ...by("Civil"), labor: true }).nodes,
    );
    expect(shown).toEqual(["Site Labor"]);
  });

  it("does not let a matching parent carry its children through on Setup", () => {
    // Under a text search Setup keeps a match's subtree; a discipline filter
    // must not list a blank-discipline row as Piping because its parent is.
    expect(names(filterCbsTree(buildCbsTree(ROWS), by("Piping")))).toEqual([
      "Piping",
    ]);
  });
});

describe("row type and material type filters", () => {
  const M = (code: string, name: string, materialType: string | null) =>
    item(code, { name, materialType });
  const ROWS = [
    item("601-00-0000-00-0", { name: "Welding", materialType: "Tagged" }),
    item("601-00-0000-00-L", { name: "Welding Labor", materialType: "Tagged" }),
    M("601-00-0000-00-M", "Welding Tagged", "Tagged"),
    M("601-05-0000-00-M", "Bolts Bulk", "Bulks"),
    M("601-10-0000-00-M", "Unknown Material", null),
    item("601-15-0000-00-S", { name: "Generated Subs", isOriginal: false }),
  ];
  const names = (nodes: CbsTreeNode[]): string[] =>
    nodes.flatMap((n) => [n.item.name, ...names(n.children)]);
  const kept = (over: Partial<CbsRowFilter>) =>
    names(
      pruneCbsTree(buildCbsTree(ROWS), { ...CBS_FILTER_NONE, ...over }).nodes,
    );

  it("Row Type picks out generated rows, or only the originals", () => {
    // Without an Original Row flag a line is read by its cost type: every
    // typed line is generated, the -0 row is the original.
    expect(kept({ rowType: "generated" }).sort()).toEqual([
      "Bolts Bulk",
      "Generated Subs",
      "Unknown Material",
      "Welding Labor",
      "Welding Tagged",
    ]);
    expect(kept({ rowType: "original" })).toEqual(["Welding"]);
    expect(cbsFilterIsEmpty({ ...CBS_FILTER_NONE, rowType: "all" })).toBe(true);
    expect(cbsFilterIsEmpty({ ...CBS_FILTER_NONE, rowType: "original" })).toBe(
      false,
    );
  });

  it("reads the workbook's Original Row flag before the cost type", () => {
    const flagged = [
      item("602-00-0000-00-0", { name: "Account", isOriginal: true }),
      item("602-00-0000-00-L", { name: "Account Labor", isOriginal: false }),
      // Imported before the column: read by its cost type instead.
      item("602-05-0000-00-S", { name: "Old Twin", isOriginal: null }),
      item("602-10-0000-00-0", { name: "Old Account", isOriginal: null }),
    ];
    const keep = (rowType: CbsRowFilter["rowType"]) =>
      names(
        pruneCbsTree(buildCbsTree(flagged), { ...CBS_FILTER_NONE, rowType })
          .nodes,
      );
    expect(keep("generated").sort()).toEqual(["Account Labor", "Old Twin"]);
    expect(keep("original").sort()).toEqual(["Account", "Old Account"]);
  });

  it("offers only the Material Types found on Materials lines", () => {
    // The account and its Labor line carry "Tagged" too, but are not counted.
    expect(cbsValueFilterOptions(ROWS).materialTypes).toEqual([
      { value: "Bulks", count: 1 },
      { value: "Tagged", count: 1 },
      { value: CBS_BLANK_VALUE, count: 1 },
    ]);
  });

  it("narrows the Materials lines to the types picked", () => {
    expect(kept({ material: true, materialTypes: ["Bulks"] })).toEqual([
      "Bolts Bulk",
    ]);
    expect(kept({ material: true, materialTypes: [CBS_BLANK_VALUE] })).toEqual([
      "Unknown Material",
    ]);
  });

  it("leaves other cost types alone when Labor is on too", () => {
    const shown = kept({
      material: true,
      labor: true,
      materialTypes: ["Bulks"],
    });
    expect(shown).toContain("Bolts Bulk");
    expect(shown).toContain("Welding Labor");
    expect(shown).not.toContain("Welding Tagged");
  });

  it("is ignored while Materials is off", () => {
    // A stale pick must not hide rows once its cost type is turned off.
    expect(
      cbsFilterIsEmpty({ ...CBS_FILTER_NONE, materialTypes: ["Bulks"] }),
    ).toBe(true);
    expect(kept({ labor: true, materialTypes: ["Bulks"] })).toEqual([
      "Welding Labor",
    ]);
  });
});

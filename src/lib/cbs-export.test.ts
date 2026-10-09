import { describe, expect, it } from "vitest";
import {
  buildCbsTree,
  parseCbsDisplayCode,
  pruneCbsTree,
  type CbsTreeItem,
} from "./cbs-tree";
import {
  CBS_EXPORT_COLUMNS,
  cbsProjectTitle,
  flattenCbsForExport,
} from "./cbs-export";

/**
 * The export's job is to carry what the page shows. These tests feed it the
 * same tree the page derives — filter included — and check the flattening,
 * because that is where the hierarchy becomes Excel outline levels.
 */

let nextId = 1;
function item(
  displayCode: string,
  over: Partial<CbsTreeItem> = {},
): CbsTreeItem {
  return {
    id: nextId++,
    ...parseCbsDisplayCode(displayCode),
    displayCode,
    name: "",
    accountDescription: "",
    uom: "",
    rowType: "ORIGINAL",
    ...over,
  };
}

/** 050 → 052 → 052-15 → two leaves: depths 0..3. */
const TREE = () =>
  buildCbsTree([
    item("050-00-0000-00-0", { name: "Field Indirects", uom: "LS" }),
    item("052-00-0000-00-0", { name: "Field Staff" }),
    item("052-15-0000-00-L", { name: "Superintendents" }),
    item("052-15-0500-00-L", { name: "Supers - General Field", uom: "HR" }),
    item("052-15-1000-00-L", { name: "Supers - Civil" }),
  ]);

const NO_FILTER = { query: "", sub: false, material: false };

describe("flattenCbsForExport", () => {
  it("emits pre-order rows with tree depth as the outline level", () => {
    const rows = flattenCbsForExport(TREE());
    expect(rows.map((r) => [r.displayCode, r.outlineLevel] as const)).toEqual([
      ["050-00-0000-00-0", 0],
      ["052-00-0000-00-0", 1],
      ["052-15-0000-00-L", 2],
      ["052-15-0500-00-L", 3],
      ["052-15-1000-00-L", 3],
    ]);
  });

  it("carries the code level separately, since that is what colours a row", () => {
    // Depth and level diverge when an intermediate code is absent; the fill
    // follows the level so the export matches the page's colouring.
    const rows = flattenCbsForExport(
      buildCbsTree([
        item("600-00-0000-00-0", { name: "Piping" }),
        item("601-05-1000-00-L", { name: "Deep leaf" }),
      ]),
    );
    const leaf = rows.find((r) => r.name === "Deep leaf")!;
    expect(leaf.outlineLevel).toBe(1);
    expect(leaf.level).toBe(3);
  });

  it("exports collapsed branches too — Excel's own grouping collapses them", () => {
    // Expansion state is never consulted: a user with everything collapsed
    // still gets the whole filtered set, grouped.
    expect(flattenCbsForExport(TREE())).toHaveLength(5);
  });

  it("exports only what the filter left, ancestors included", () => {
    const { nodes } = pruneCbsTree(TREE(), {
      ...NO_FILTER,
      query: "general field",
    });
    const rows = flattenCbsForExport(nodes);
    expect(rows.map((r) => r.displayCode)).toEqual([
      "050-00-0000-00-0",
      "052-00-0000-00-0",
      "052-15-0000-00-L",
      "052-15-0500-00-L",
    ]);
    // Ancestors keep their depth, so the match still nests in the file.
    expect(rows.at(-1)!.outlineLevel).toBe(3);
  });

  it("honours the Subcontracts / Materials toggles", () => {
    const tree = buildCbsTree([
      item("600-00-0000-00-0", { name: "Piping" }),
      item("601-00-0000-00-0", { name: "Spool", subReporting: true }),
      item("601-05-0000-00-0", { name: "Bolt-up", materialCode: true }),
    ]);
    const { nodes } = pruneCbsTree(tree, { ...NO_FILTER, sub: true });
    expect(flattenCbsForExport(nodes).map((r) => r.name)).toEqual([
      "Piping",
      "Spool",
    ]);
  });

  it("writes the workbook's YES flags from the row's own codes", () => {
    const rows = flattenCbsForExport(
      buildCbsTree([
        item("100-00-0000-00-0", {
          name: "Civil",
          subReporting: true,
          materialCode: true,
        }),
        item("101-00-0000-00-0", { name: "Plain" }),
      ]),
    );
    expect(rows[0]).toMatchObject({ subCode: "YES", materialCode: "YES" });
    expect(rows[1]).toMatchObject({ subCode: "", materialCode: "" });
  });

  it("marks a context row and suppresses its flags", () => {
    // Context rows are ancestors the project was not granted. They are shown
    // muted and badge-less on the page; the export must not present them as
    // usable codes just because the workbook says Sub Code YES.
    const rows = flattenCbsForExport(
      buildCbsTree([
        item("100-00-0000-00-0", {
          name: "Civil",
          subReporting: true,
          context: true,
        }),
      ]),
    );
    expect(rows[0]).toMatchObject({
      context: true,
      subCode: "",
      materialCode: "",
    });
  });

  it("falls back to the account description, then the code, for a nameless row", () => {
    const rows = flattenCbsForExport(
      buildCbsTree([
        item("100-00-0000-00-0", { accountDescription: "From account" }),
        item("101-00-0000-00-0"),
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual([
      "From account",
      "101-00-0000-00-0",
    ]);
  });
});

describe("cbsProjectTitle", () => {
  it("drops a leading copy of the project's own number", () => {
    // The names in use already start with the number, so printing both
    // verbatim read "1901 — 1901 - FIME Engineering".
    expect(cbsProjectTitle("1901", "1901 - FIME Engineering")).toBe(
      "FIME Engineering",
    );
    expect(cbsProjectTitle("1902", "1902 — FIME Mechanical")).toBe(
      "FIME Mechanical",
    );
    expect(cbsProjectTitle("1903", "1903: FIME Product Handling")).toBe(
      "FIME Product Handling",
    );
  });

  it("leaves a title that does not start with the number alone", () => {
    expect(cbsProjectTitle("1901", "FIME Engineering")).toBe(
      "FIME Engineering",
    );
    // A different number is not this project's prefix.
    expect(cbsProjectTitle("1901", "2001 - Other Job")).toBe(
      "2001 - Other Job",
    );
    // The number must be followed by a separator, not just happen to prefix it.
    expect(cbsProjectTitle("190", "1901 - FIME")).toBe("1901 - FIME");
  });

  it("keeps the name when stripping would leave nothing", () => {
    expect(cbsProjectTitle("1901", "1901")).toBe("1901");
    expect(cbsProjectTitle("1901", "1901 - ")).toBe("1901 -");
  });

  it("handles a blank or regex-special number without throwing", () => {
    expect(cbsProjectTitle("", "FIME Engineering")).toBe("FIME Engineering");
    expect(cbsProjectTitle("A.1(x)", "A.1(x) - Job")).toBe("Job");
  });
});

describe("CBS_EXPORT_COLUMNS", () => {
  const row = flattenCbsForExport(TREE());

  it("indents the name by outline level as well as grouping it", () => {
    // Excel's grouping hides rows but does not indent them, so a flat name
    // column would lose the shape the tree conveys.
    const nameCol = CBS_EXPORT_COLUMNS.find((c) => c.header === "Name")!;
    expect(nameCol.get(row[0])).toBe("Field Indirects");
    expect(nameCol.get(row[2])).toBe("    Superintendents");
  });

  it("does not expose how a row got into the dictionary", () => {
    // ORIGINAL / SUB / MATERIAL is internal vocabulary; the people this file
    // goes to only need to know what a code is, not how it was produced.
    // A generated row is still identifiable by its display code's cost type.
    const headers = CBS_EXPORT_COLUMNS.map((c) => c.header);
    expect(headers).not.toContain("Row Type");
    expect(headers.join(" ").toLowerCase()).not.toContain("row type");

    const cells = CBS_EXPORT_COLUMNS.map((c) => String(c.get(row[0])));
    for (const internal of ["ORIGINAL", "SUB", "MATERIAL"]) {
      expect(cells).not.toContain(internal);
    }
  });

  it("gives every column a header and a usable width", () => {
    for (const c of CBS_EXPORT_COLUMNS) {
      expect(c.header).not.toBe("");
      expect(c.width).toBeGreaterThan(4);
    }
  });

  it("reports a context row as unavailable", () => {
    const col = CBS_EXPORT_COLUMNS.find((c) => c.header === "Available")!;
    expect(col.get({ ...row[0], context: true })).toBe("Context only");
    expect(col.get(row[0])).toBe("Yes");
  });
});

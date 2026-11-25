import { describe, expect, it } from "vitest";
import { loadCbsLegacyWorkbook } from "../../prisma/cbs-legacy-workbook";
import {
  buildCbsTree,
  cbsLegacyTreeRow,
  isCbsLegacyCode,
  parseCbsDisplayCode,
  type CbsTreeItem,
  type CbsTreeNode,
} from "./cbs-tree";

const legacy = (id: number, code: string, over = {}) =>
  cbsLegacyTreeRow({
    id,
    code,
    name: code,
    uom: "",
    status: "Retired",
    laborCode: false,
    subReporting: false,
    materialCode: false,
    equipmentCode: false,
    otherCode: false,
    rentalCode: false,
    ...over,
  });

const cbs = (id: number, displayCode: string): CbsTreeItem => ({
  id,
  ...parseCbsDisplayCode(displayCode),
  displayCode,
  name: displayCode,
  accountDescription: "",
  uom: "",
});

const outline = (nodes: CbsTreeNode[]): string[] =>
  nodes.flatMap((n) => [
    `${"  ".repeat(n.depth)}${n.item.displayCode}`,
    ...outline(n.children),
  ]);

describe("legacy codes in the CBS tree", () => {
  it("nests by sheet order, after the CBS proper", () => {
    const tree = buildCbsTree<CbsTreeItem>([
      legacy(1, "66XXXXX"),
      legacy(2, "665XXXX"),
      // Numbered 5-something under a 66x summary, as the source has it.
      legacy(3, "5655016"),
      legacy(4, "88XXXXX"),
      legacy(5, "282XXXX"),
      cbs(1, "010-00-0000-00-0"),
    ]);
    expect(outline(tree)).toEqual([
      "010-00-0000-00-0",
      "66XXXXX",
      "  665XXXX",
      "    5655016",
      "88XXXXX",
      "  282XXXX",
    ]);
  });

  it("keeps a repeated code as two rows with distinct keys", () => {
    const tree = buildCbsTree([legacy(1, "5715000"), legacy(2, "5715000")]);
    expect(tree.map((n) => n.pathKey)).toEqual(["5715000", "5715000#-2"]);
  });

  it("gives a row its cost type and an id no catalog row can have", () => {
    expect(legacy(7, "0011000", { laborCode: true })).toMatchObject({
      id: -7,
      l6: "L",
      legacy: true,
    });
    expect(legacy(8, "00110XX").l6).toBe("0");
  });

  it("tells a legacy code from a CBS one", () => {
    expect(isCbsLegacyCode("00110XX")).toBe(true);
    expect(isCbsLegacyCode("563950")).toBe(true);
    expect(isCbsLegacyCode("012-05-1000-00-0")).toBe(false);
  });
});

describe("LegacyCBS.xlsx", () => {
  it("loads whole: every row Retired, every code legacy-shaped, all placed", async () => {
    const rows = await loadCbsLegacyWorkbook();
    expect(rows.length).toBeGreaterThan(1000);
    expect(rows.filter((r) => r.status !== "Retired")).toEqual([]);
    expect(rows.filter((r) => !isCbsLegacyCode(r.code))).toEqual([]);
    const tree = buildCbsTree(
      rows.map((r, i) => cbsLegacyTreeRow({ ...r, id: i + 1 })),
    );
    // Only division summaries at the top: nothing stranded.
    expect(tree.filter((n) => !/^\d\dXXXXX$/.test(n.item.displayCode))).toEqual(
      [],
    );
    expect(tree.flatMap((n) => n.descendantItemIds)).toHaveLength(rows.length);
  });
});

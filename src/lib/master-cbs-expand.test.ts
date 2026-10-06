import { describe, expect, it } from "vitest";
import {
  expandCbsDictionary,
  withCostType,
  type MasterCbsItem,
} from "../../prisma/master-cbs";

function original(
  displayCode: string,
  name: string,
  flags: { sub?: boolean; material?: boolean } = {},
): MasterCbsItem {
  return {
    l1: displayCode.slice(0, 3),
    l2: displayCode.slice(4, 6),
    l3: displayCode.slice(7, 9),
    l4: displayCode.slice(9, 11),
    l5: displayCode.slice(12, 14),
    l6: displayCode.slice(15, 16),
    name,
    displayCode,
    uom: "LS",
    subReporting: flags.sub ?? false,
    materialCode: flags.material ?? false,
    materialType: null,
    costCenter: null,
    costClassification: null,
    status: "Active",
    accountDescription: name,
    l2Description: null,
    core: null,
    coreExtension: null,
    wbs: null,
    p6CostAccount: null,
    gl: null,
    discipline: null,
    costCode: displayCode.replace(/-/g, ""),
    description: `Summary of ${name}.`,
    notes: null,
    displayDescription: `${displayCode}:  ${name}`,
    rowType: "ORIGINAL",
    generatedFrom: null,
  };
}

describe("withCostType", () => {
  it("swaps only the trailing cost-type segment", () => {
    expect(withCostType("101-05-0000-00-0", "S")).toBe("101-05-0000-00-S");
    expect(withCostType("610-LB-12FB-ST-L", "M")).toBe("610-LB-12FB-ST-M");
  });
});

describe("expandCbsDictionary", () => {
  it("generates an S twin for Sub Code = YES and an M twin for Material Code = YES", () => {
    const { items, generatedSub, generatedMaterial } = expandCbsDictionary([
      original("100-00-0000-00-0", "Civil", { sub: true, material: true }),
    ]);
    expect(generatedSub).toBe(1);
    expect(generatedMaterial).toBe(1);
    expect(items.map((i) => i.displayCode)).toEqual([
      "100-00-0000-00-0",
      "100-00-0000-00-S",
      "100-00-0000-00-M",
    ]);
    const [, sub, mat] = items;
    expect(sub).toMatchObject({
      name: "Civil Subcontracts",
      l6: "S",
      costCode: "10000000000S",
      gl: "5200",
      rowType: "SUB",
      generatedFrom: "100-00-0000-00-0",
      displayDescription: "100-00-0000-00-S:  Civil Subcontracts",
      description: "Summary of Civil.",
    });
    expect(mat).toMatchObject({
      name: "Civil Materials",
      l6: "M",
      gl: "5100",
      rowType: "MATERIAL",
      generatedFrom: "100-00-0000-00-0",
    });
  });

  it("does not double the suffix when the name already ends with it", () => {
    const { items } = expandCbsDictionary([
      original("101-00-0000-00-0", "Civil Shop Materials", { material: true }),
    ]);
    expect(items[1].name).toBe("Civil Shop Materials");
  });

  it("skips a twin whose code already exists in the workbook", () => {
    const { items, generatedSub, skippedExistingSub } = expandCbsDictionary([
      original("052-50-4000-00-0", "Staff", { sub: true }),
      original("052-50-4000-00-S", "Staff Subs", { sub: true }),
    ]);
    expect(generatedSub).toBe(0);
    // Both originals skip: the first because its S code exists, the second
    // because its twin is itself.
    expect(skippedExistingSub).toBe(2);
    expect(items.map((i) => i.displayCode)).toEqual([
      "052-50-4000-00-0",
      "052-50-4000-00-S",
    ]);
  });

  it("generates a twin only once when two originals share a prefix", () => {
    const { items, generatedMaterial, skippedExistingMaterial } =
      expandCbsDictionary([
        original("601-05-0000-00-0", "Fab", { material: true }),
        original("601-05-0000-00-L", "Fab Labor", { material: true }),
      ]);
    expect(generatedMaterial).toBe(1);
    expect(skippedExistingMaterial).toBe(1);
    expect(items.filter((i) => i.displayCode === "601-05-0000-00-M")).toHaveLength(1);
    expect(items.find((i) => i.rowType === "MATERIAL")?.generatedFrom).toBe(
      "601-05-0000-00-0",
    );
  });

  it("leaves rows flagged NO or blank untouched", () => {
    const { items } = expandCbsDictionary([
      original("101-15-0000-00-0", "Underground"),
      { ...original("101-16-0000-00-0", "Unknown"), subReporting: null, materialCode: null },
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.rowType === "ORIGINAL")).toBe(true);
  });
});

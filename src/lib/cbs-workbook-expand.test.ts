import { describe, expect, it } from "vitest";
import {
  COST_TYPE_RULES,
  planCbsWorkbookExpansion,
  type MasterRow,
} from "./cbs-workbook-expand";

const HEADERS = [
  "L1",
  "Name",
  "Display Code",
  "Cost Code",
  "UOM",
  "Labor Code",
  "Sub Code",
  "Material Code",
  "Equipment Code",
  "Other Code",
  "Rental Code",
  "Material Type",
  "Cost Classification",
  "G/L",
  "Description",
  "Notes",
];

const FLAGS = COST_TYPE_RULES.map((r) => r.flag);

/** A master row with every flag NO unless `extra` says otherwise. */
function master(
  row: number,
  code: string,
  name: string,
  extra: Record<string, string | number | boolean | null> = {},
): MasterRow {
  return {
    row,
    cells: {
      L1: code.slice(0, 2),
      Name: name,
      "Display Code": code,
      "Cost Code": code.replace(/-/g, ""),
      UOM: "EA",
      ...Object.fromEntries(FLAGS.map((f) => [f, "NO"])),
      "Material Type": "n/a",
      "Cost Classification": "DIRECT LABOR",
      "G/L": 5000,
      Description: `Summary of ${name}.`,
      Notes: null,
      ...extra,
    },
  };
}

const codes = (plan: ReturnType<typeof planCbsWorkbookExpansion>) =>
  plan.rows.map((r) => r.cells["Display Code"]);

describe("planCbsWorkbookExpansion", () => {
  it("writes a -0 roll-up row for a master row with no cost type, flagged as the original", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "012-05-1000-00", "Home Office Executive"),
    ]);
    expect(plan.problems).toEqual([]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ rowType: "Original", sourceRow: 2 });
    expect(plan.rows[0].cells).toMatchObject({
      "Display Code": "012-05-1000-00-0",
      "Cost Code": "012051000000",
      Name: "Home Office Executive (*)",
      Description:
        "Roll-up code for Home Office Executive (summarizes all cost types).",
      "G/L": 5000,
      "Cost Classification": "DIRECT LABOR",
      "Row Type": "Original",
      "Original Row": true,
      // untouched columns pass through
      L1: "01",
      UOM: "EA",
    });
  });

  it("appends Row Type and Original Row to the master's headers once", () => {
    expect(planCbsWorkbookExpansion(HEADERS, []).headers).toEqual([
      ...HEADERS,
      "Row Type",
      "Original Row",
    ]);
    const already = [...HEADERS, "Row Type", "Original Row"];
    expect(planCbsWorkbookExpansion(already, []).headers).toEqual(already);
  });

  it("generates one typed row per YES flag, in L S M E O R order after the roll-up", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(
        2,
        "134-20-0000-00",
        "Civil Third Party Rental Equipment",
        Object.fromEntries(FLAGS.map((f) => [f, "YES"])),
      ),
    ]);
    expect(plan.problems).toEqual([]);
    expect(codes(plan)).toEqual([
      "134-20-0000-00-0",
      "134-20-0000-00-L",
      "134-20-0000-00-S",
      "134-20-0000-00-M",
      "134-20-0000-00-E",
      "134-20-0000-00-O",
      "134-20-0000-00-R",
    ]);
    expect(plan.rows.map((r) => r.rowType)).toEqual([
      "Original",
      "Labor",
      "Subcontract",
      "Material",
      "Equipment",
      "Other",
      "Rental",
    ]);
    for (const r of plan.rows.slice(1)) {
      expect(r.cells["Original Row"]).toBe(false);
      expect(r.cells["Row Type"]).toBe(r.rowType);
      expect(r.sourceRow).toBe(2);
    }
    expect(plan.stats).toMatchObject({
      masterRows: 1,
      originals: 1,
      total: 7,
      generated: {
        Labor: 1,
        Subcontract: 1,
        Material: 1,
        Equipment: 1,
        Other: 1,
        Rental: 1,
      },
    });
  });

  it.each([
    [
      "L",
      "Labor",
      5000,
      "DIRECT LABOR",
      "Labor cost for Pipe.",
      "01205100000L",
    ],
    [
      "S",
      "Subcontract",
      5200,
      "DIRECT SUBCONTRACT",
      "Subcontract cost for Pipe.",
      "01205100000S",
    ],
    [
      "M",
      "Material",
      5100,
      "MATERIALS",
      "Material cost for Pipe.",
      "01205100000M",
    ],
    [
      "E",
      "Equipment",
      5300,
      "DIRECT EQUIPMENT",
      "Equipment cost for Pipe.",
      "01205100000E",
    ],
    [
      "O",
      "Other",
      5400,
      "DIRECT LABOR",
      "Other cost for Pipe.",
      "01205100000O",
    ],
    [
      "R",
      "Rental",
      5500,
      "DIRECT LABOR",
      "Rental cost for Pipe.",
      "01205100000R",
    ],
  ])(
    "the %s row carries its name marker, G/L, classification and description",
    (type, rowType, gl, classification, description, costCode) => {
      const rule = COST_TYPE_RULES.find((r) => r.type === type)!;
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "012-05-1000-00", "Pipe", { [rule.flag]: "YES" }),
      ]);
      // One cost type and nothing beneath: the typed row alone, no roll-up,
      // and it is the account's original row since no other row is.
      expect(plan.rows).toHaveLength(1);
      expect(plan.rows[0].rowType).toBe(rowType);
      expect(plan.rows[0].cells).toMatchObject({
        "Display Code": `012-05-1000-00-${type}`,
        "Cost Code": costCode,
        Name: `Pipe (${type})`,
        "G/L": gl,
        "Cost Classification": classification,
        Description: description,
        "Row Type": rowType,
        "Original Row": true,
      });
      expect(plan.stats).toMatchObject({ originals: 0, rollupsSkipped: 1 });
    },
  );

  describe("the roll-up row is written only where it has more than one row to summarize", () => {
    it("leaves it out for an account with one cost type and nothing beneath it", () => {
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "543-05-1005-15", "Tube Banks / Coils", {
          "Labor Code": "YES",
        }),
      ]);
      expect(plan.problems).toEqual([]);
      expect(codes(plan)).toEqual(["543-05-1005-15-L"]);
      expect(plan.rows[0].cells["Original Row"]).toBe(true);
      expect(plan.stats).toMatchObject({
        originals: 0,
        rollupsSkipped: 1,
        total: 1,
      });
    });

    it("keeps it for an account with two cost types", () => {
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "543-05-1005-15", "Tube Banks / Coils", {
          "Labor Code": "YES",
          "Material Code": "YES",
        }),
      ]);
      expect(codes(plan)).toEqual([
        "543-05-1005-15-0",
        "543-05-1005-15-L",
        "543-05-1005-15-M",
      ]);
      expect(plan.rows.map((r) => r.cells["Original Row"])).toEqual([
        true,
        false,
        false,
      ]);
      expect(plan.stats.rollupsSkipped).toBe(0);
    });

    it("keeps it for a single-type account that has accounts beneath it", () => {
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "543-05-1000-00", "Fired Heaters", { "Labor Code": "YES" }),
        master(3, "543-05-1005-15", "Tube Banks / Coils", {
          "Labor Code": "YES",
        }),
      ]);
      expect(codes(plan)).toEqual([
        "543-05-1000-00-0",
        "543-05-1000-00-L",
        "543-05-1005-15-L",
      ]);
      expect(plan.stats).toMatchObject({ originals: 1, rollupsSkipped: 1 });
    });

    it("counts a division's L1 accounts as beneath its root, the way the tree does", () => {
      // 012 is not a four-segment descendant of 010, but the tree roots it
      // there (getGroupL1), so 010's roll-up has something to summarize.
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "010-00-0000-00", "Home Office and Administration", {
          "Labor Code": "YES",
        }),
        master(3, "012-00-0000-00", "Home Office Construction Support", {
          "Labor Code": "YES",
        }),
      ]);
      expect(codes(plan)).toEqual([
        "010-00-0000-00-0",
        "010-00-0000-00-L",
        "012-00-0000-00-L",
      ]);
    });

    it("counts the pipe shop's size/schedule variants as beneath their bore account", () => {
      // 610-LB-1200-ST hangs off 610-LB-1200-00's roll-up in the tree, so
      // that roll-up has something to summarize even with one cost type.
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "610-LB-1200-00", 'Pipe Shop 12" LB', {
          "Labor Code": "YES",
        }),
        master(3, "610-LB-1200-ST", 'Pipe Shop 12" LB STD', {
          "Labor Code": "YES",
        }),
      ]);
      expect(codes(plan)).toEqual([
        "610-LB-1200-00-0",
        "610-LB-1200-00-L",
        "610-LB-1200-ST-L",
      ]);
    });

    it("keeps it for an account with no cost type at all, so the account survives", () => {
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "543-05-1005-15", "Reserved"),
      ]);
      expect(codes(plan)).toEqual(["543-05-1005-15-0"]);
      expect(plan.stats.rollupsSkipped).toBe(0);
    });

    it("treats a Both material split as one cost type: two rows, one code, no roll-up", () => {
      const plan = planCbsWorkbookExpansion(HEADERS, [
        master(2, "543-05-1005-15", "Tube Banks / Coils", {
          "Material Code": "YES",
          "Material Type": "Both",
        }),
      ]);
      expect(
        plan.rows.map((r) => [
          r.cells["Display Code"],
          r.cells["Material Type"],
          r.cells["Original Row"],
        ]),
      ).toEqual([
        ["543-05-1005-15-M", "Bulk", true],
        ["543-05-1005-15-M", "Tagged", true],
      ]);
    });
  });

  it("keeps the master's flags on every generated row", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "013-10-0500-00", "Small Tools", {
        "Material Code": "YES",
        "Other Code": "YES",
      }),
    ]);
    expect(plan.rows).toHaveLength(3);
    for (const r of plan.rows) {
      expect(r.cells["Material Code"]).toBe("YES");
      expect(r.cells["Other Code"]).toBe("YES");
      expect(r.cells["Labor Code"]).toBe("NO");
    }
  });

  it("splits a Both material type into a Bulk and a Tagged material row, and leaves Both on nothing", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "448-05-0000-00", "Building Services Piping", {
        "Labor Code": "YES",
        "Material Code": "YES",
        "Material Type": "Both",
      }),
    ]);
    expect(plan.problems).toEqual([]);
    expect(
      plan.rows.map((r) => [r.cells["Display Code"], r.cells["Material Type"]]),
    ).toEqual([
      ["448-05-0000-00-0", "n/a"],
      ["448-05-0000-00-L", "n/a"],
      ["448-05-0000-00-M", "Bulk"],
      ["448-05-0000-00-M", "Tagged"],
    ]);
    const [bulk, tagged] = plan.rows.slice(2);
    expect({ ...bulk.cells, "Material Type": null }).toEqual({
      ...tagged.cells,
      "Material Type": null,
    });
    expect(plan.stats.materialBothSplit).toBe(1);
    expect(plan.stats.generated.Material).toBe(2);
    // The two rows share a code; the loader keeps the first. Say so.
    expect(plan.warnings.some((w) => w.includes("448-05-0000-00-M"))).toBe(
      true,
    );
  });

  it("warns about a Both material type on an account with no material row", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "448-05-0000-00", "Piping", { "Material Type": "Both" }),
    ]);
    expect(plan.rows[0].cells["Material Type"]).toBe("n/a");
    expect(plan.warnings[0]).toMatch(/Both but Material Code NO/);
  });

  it("keeps a material type that is not Both as it is on every row", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "142-05-0000-00", "MSE Walls", {
        "Labor Code": "YES",
        "Material Code": "YES",
        "Material Type": "Bulk",
      }),
    ]);
    expect(plan.rows.map((r) => r.cells["Material Type"])).toEqual([
      "Bulk",
      "Bulk",
      "Bulk",
    ]);
  });

  it("derives the cost code from the display code and warns when the sheet disagreed", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "012-05-1000-00", "Pipe", { "Cost Code": "99999999999" }),
    ]);
    expect(plan.rows[0].cells["Cost Code"]).toBe("012051000000");
    expect(plan.warnings[0]).toMatch(/Cost Code that disagreed/);
  });

  it("refuses a file that is already expanded", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "012-05-1000-00-0", "Pipe (*)"),
      master(3, "012-05-1000-00-L", "Pipe (L)"),
    ]);
    expect(plan.rows).toEqual([]);
    expect(plan.problems[0]).toMatch(/already expanded/);
  });

  it("refuses malformed codes, blank names, duplicates and unknown flag values", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      master(2, "012-05-10", "Short"),
      master(3, "012-05-1000-00", ""),
      master(4, "012-05-2000-00", "Dup"),
      master(5, "012-05-2000-00", "Dup again"),
      master(6, "012-05-3000-00", "Maybe", { "Sub Code": "MAYBE" }),
    ]);
    expect(plan.problems).toEqual([
      'row 2: display code "012-05-10" is not XXX-XX-XXXX-XX',
      "row 3: 012-05-1000-00 has no name",
      "row 5: 012-05-2000-00 duplicates row 4",
      'row 6: 012-05-3000-00 has "Sub Code" = "MAYBE", expected YES or NO',
    ]);
  });

  it("refuses a master missing a column a rule needs", () => {
    const plan = planCbsWorkbookExpansion(
      HEADERS.filter((h) => h !== "Rental Code"),
      [],
    );
    expect(plan.problems).toEqual(['master has no "Rental Code" column']);
  });

  it("skips fully blank rows and warns when a name already carries a marker", () => {
    const plan = planCbsWorkbookExpansion(HEADERS, [
      { row: 2, cells: { Name: "", "Display Code": "" } },
      master(3, "012-05-1000-00", "Pipe (S)"),
    ]);
    expect(plan.stats.masterRows).toBe(1);
    expect(plan.warnings[0]).toMatch(/already ends in a cost-type marker/);
  });
});

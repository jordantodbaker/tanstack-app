import { describe, expect, it } from "vitest";
import { runCbsQcChecks, type QcRow } from "./cbs-qc";

let nextId = 1;
/** A row that passes every check, so a case only has to break one thing. */
function row(displayCode: string, over: Partial<QcRow> = {}): QcRow {
  return {
    id: nextId++,
    displayCode,
    costCode: displayCode.replace(/-/g, ""),
    name: `Account ${displayCode}`,
    uom: "LS",
    description: "Cost for the account",
    accountDescription: "Account description",
    l2Description: "L2 description",
    costCenter: "1234",
    costClassification: "DIRECT",
    status: "Active",
    gl: "5000",
    discipline: "Piping",
    materialType: null,
    materialCode: null,
    subReporting: null,
    masterCbsRow: 100,
    ...over,
  };
}

const find = (rows: QcRow[], id: string) =>
  runCbsQcChecks(rows).find((c) => c.id === id)!;

describe("runCbsQcChecks", () => {
  it("flags a roll-up level that carries a cost type", () => {
    // The workbook's L3 segment is characters 5-6 of the display code; "00"
    // there means a roll-up, which must be cost type 0.
    const c = find([row("600-00-0000-00-L")], "qc-l3-cost-type");
    expect(c.count).toBe(1);
    expect(c.severity).toBe("error");
  });

  it("accepts a roll-up level that carries cost type 0", () => {
    expect(find([row("600-00-0000-00-0")], "qc-l3-cost-type").count).toBe(0);
  });

  it("flags a parent whose children have mixed cost types", () => {
    const rows = [
      row("600-10-0000-00-L"),
      row("600-10-1000-00-L"),
      row("600-10-1000-00-M"),
    ];
    const c = find(rows, "qc-parent-cost-type");
    expect(c.count).toBe(1);
    expect(c.findings[0].detail).toContain("expected 0");
  });

  it("accepts a parent that shares its children's single cost type", () => {
    const rows = [row("600-10-0000-00-L"), row("600-10-1000-00-L")];
    expect(find(rows, "qc-parent-cost-type").count).toBe(0);
  });

  it("requires Sub Code NO on Haskell Owned Equipment", () => {
    const c = find(
      [
        row("604-10-0000-00-0", {
          name: "Haskell Owned Equipment",
          subReporting: true,
        }),
      ],
      "qc-sub-code-ownership",
    );
    expect(c.count).toBe(1);
    expect(c.findings[0].detail).toContain("expected NO");
  });

  it("requires Sub Code YES on Third Party Equipment", () => {
    const c = find(
      [
        row("604-20-0000-00-0", {
          name: "3rd Party Equipment",
          subReporting: false,
        }),
      ],
      "qc-sub-code-ownership",
    );
    expect(c.count).toBe(1);
    expect(c.findings[0].detail).toContain("expected YES");
  });

  it("takes ownership from the nearest ancestor when the row does not say", () => {
    const rows = [
      row("604-20-0000-00-0", {
        name: "Third Party Equipment",
        subReporting: true,
      }),
      row("604-20-1000-00-0", { name: "Crane", subReporting: false }),
    ];
    const c = find(rows, "qc-sub-code-ownership");
    expect(c.count).toBe(1);
    // The affected row is named in its own column; the detail says where the
    // expectation came from.
    expect(c.findings[0].name).toBe("Crane");
    expect(c.findings[0].detail).toContain("Third Party Equipment");
  });

  it("lets the row's own name beat its ancestor's", () => {
    // A Haskell-owned line under a third-party parent is its own thing.
    const rows = [
      row("604-20-0000-00-0", {
        name: "Third Party Equipment",
        subReporting: true,
      }),
      row("604-20-1000-00-0", {
        name: "Haskell Owned Equipment - small tools",
        subReporting: false,
      }),
    ];
    expect(find(rows, "qc-sub-code-ownership").count).toBe(0);
  });

  it("ignores third-party wording that is not about equipment", () => {
    // "Third Party" services are deliberately out of scope for the rule.
    const c = find(
      [
        row("010-10-0000-00-0", {
          name: "Third Party Services",
          subReporting: false,
        }),
      ],
      "qc-sub-code-ownership",
    );
    expect(c.count).toBe(0);
  });

  it("separates a blank material type from one reading n/a", () => {
    const rows = [
      row("601-10-0000-00-M", { materialCode: true, materialType: null }),
      row("601-20-0000-00-M", { materialCode: true, materialType: "n/a" }),
    ];
    expect(find(rows, "qc-material-type")).toMatchObject({
      count: 1,
      severity: "error",
    });
    expect(find(rows, "qc-material-type-na")).toMatchObject({
      count: 1,
      severity: "warning",
    });
  });

  it("counts every blank required field and breaks them down by column", () => {
    const rows = [
      row("601-10-0000-00-0", { discipline: "", costCenter: null }),
    ];
    const c = find(rows, "qc-required-fields");
    expect(c.count).toBe(2);
    // One finding per blank cell, so the export is a worklist…
    expect(c.findings.map((f) => f.detail).sort()).toEqual([
      "no Cost Center",
      "no Discipline",
    ]);
    // …and the per-column tally reads in the summary.
    expect(c.summary).toContain("Discipline 1");
    expect(c.summary).toContain("Cost Center 1");
  });

  it("compares duplicate names across accounts, not cost-type variants", () => {
    // The workbook is pre-expanded: an account's L/S/M rows share its name by
    // design, and counting those would bury the real duplicates.
    const variants = [
      row("601-10-0000-00-0", { name: "Bolt-up" }),
      row("601-10-0000-00-S", { name: "Bolt-up" }),
      row("601-10-0000-00-M", { name: "Bolt-up" }),
    ];
    expect(find(variants, "qc-duplicate-names").count).toBe(0);

    const real = [
      row("601-10-0000-00-0", { name: "Bolt-up" }),
      row("602-10-0000-00-0", { name: "Bolt-up" }),
    ];
    expect(find(real, "qc-duplicate-names").count).toBe(2);
  });

  it("flags a non-standard unit and groups the report by unit", () => {
    const rows = [
      row("601-10-0000-00-0", { uom: "DI" }),
      row("601-20-0000-00-0", { uom: "DI" }),
      row("601-30-0000-00-0", { uom: "LS" }),
    ];
    const c = find(rows, "qc-uom-standard");
    expect(c.count).toBe(2);
    expect(c.findings.map((f) => f.code)).toEqual([
      "601-10-0000-00-0",
      "601-20-0000-00-0",
    ]);
    expect(c.summary).toContain("DI 2");
  });

  it("flags a unit that disagrees with the name, on leaf rows only", () => {
    const leaf = [
      row("601-10-0000-00-0", { name: "Pipe supports", uom: "EA" }),
    ];
    expect(find(leaf, "qc-uom-vs-name").count).toBe(0); // EA is allowed for pipe
    const bad = [row("601-10-0000-00-0", { name: "Pipe supports", uom: "TN" })];
    expect(find(bad, "qc-uom-vs-name").count).toBe(1);
  });

  it("flags stray whitespace in the text columns", () => {
    const c = find(
      [
        row("601-10-0000-00-0", {
          name: "Bolt-up ",
          description: "Two  spaces",
        }),
      ],
      "qc-extra-spaces",
    );
    expect(c.count).toBe(2);
  });

  it("flags a discipline that disagrees with the rest of its division", () => {
    const rows = [
      row("601-10-0000-00-0", { discipline: "Piping" }),
      row("601-20-0000-00-0", { discipline: "Piping" }),
      row("601-30-0000-00-0", { discipline: "Civil" }),
    ];
    const c = find(rows, "qc-discipline-consistency");
    expect(c.count).toBe(1);
    expect(c.findings[0].detail).toContain("Civil");
  });

  it("returns findings in spreadsheet row order", () => {
    // The list is worked down in the spreadsheet, so it has to arrive sorted
    // rather than in whatever order each rule happened to walk the rows.
    const rows = [
      { ...row("603-00-0000-00-L"), masterCbsRow: 900 },
      { ...row("601-00-0000-00-L"), masterCbsRow: 100 },
      { ...row("602-00-0000-00-L"), masterCbsRow: 500 },
    ];
    // Every one of these is a roll-up level carrying a cost type.
    const c = find(
      rows.map((r) => ({ ...r, displayCode: r.displayCode })),
      "qc-l3-cost-type",
    );
    expect(c.findings.map((f) => f.masterRow)).toEqual([100, 500, 900]);
  });

  it("sorts findings with no row to the end, not the top", () => {
    const rows = [
      { ...row("603-00-0000-00-L"), masterCbsRow: null },
      { ...row("601-00-0000-00-L"), masterCbsRow: 100 },
    ];
    const c = find(rows, "qc-l3-cost-type");
    expect(c.findings.map((f) => f.masterRow)).toEqual([100, null]);
  });

  it("reports a passing check as clear rather than leaving it out", () => {
    // "Nothing reported" and "never asked" must not look the same.
    const checks = runCbsQcChecks([row("601-10-0000-00-0")]);
    const clean = checks.filter((c) => c.count === 0);
    expect(clean.length).toBeGreaterThan(0);
    for (const c of clean) {
      expect(c.severity).toBe("info");
      expect(c.summary).not.toBe("");
    }
  });
});

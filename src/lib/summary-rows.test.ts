import { describe, it, expect } from "vitest";
import { buildSummaryRows, toSummaryExportRows } from "./summary-rows";
import { formatMoney } from "./formatting";
import { SUMMARY_DISCIPLINES } from "~/config/disciplines";
import type { ProjectFefRowTotals } from "~/utils/projectTotals";

const emptyTotals = (): ProjectFefRowTotals => ({
  laborByDigit: {},
  laborHoursByDigit: {},
  quantityByDigit: {},
  craftSupportLabor: 0,
  craftSupportLaborHours: 0,
  materialsByDigit: {},
  laborByL1: {},
  laborHoursByL1: {},
  quantityByL1: {},
  materialsByL1: {},
  laborByL1L2: {},
  laborHoursByL1L2: {},
  quantityByL1L2: {},
  materialsByL1L2: {},
  byArea: [],
  invalidByDiscipline: {},
});

const concreteLabel = SUMMARY_DISCIPLINES.find((d) => d.digit === "2")!.label;

describe("buildSummaryRows — Concrete and Grout reported together", () => {
  it("reports the whole digit-2 bucket on one row, grout included", () => {
    // Grout's 29X codes are already inside digit 2. They used to be summed out
    // of the L1 buckets and subtracted back off Concrete so the two could show
    // separately; reporting them together means that arithmetic is gone, not
    // rearranged — the row is simply what the bucket holds.
    const t = emptyTotals();
    // Every measure, not just labor: the old carve-out subtracted all four, so
    // testing one would let a leftover subtraction on any of the others pass.
    t.laborByDigit["2"] = 1000;
    t.materialsByDigit["2"] = 4000;
    t.laborHoursByDigit["2"] = 50;
    t.quantityByDigit["2"] = 200;
    // Grout's L1 share — present in the buckets, and must NOT be subtracted.
    t.laborByL1["290"] = 300;
    t.materialsByL1["290"] = 1200;
    t.laborHoursByL1["290"] = 15;
    t.quantityByL1["290"] = 60;
    const { disciplines } = buildSummaryRows(t);

    const combined = disciplines.find((r) => r.description === concreteLabel);
    expect(combined?.totalLabor).toBe(formatMoney(1000));
    expect(combined?.material).toBe(formatMoney(4000));
    expect(combined?.hrs).toBe(formatMoney(50));
    expect(combined?.qty).toBe(formatMoney(200));
  });

  it("no longer emits a separate Grout row", () => {
    const { disciplines } = buildSummaryRows(emptyTotals());
    expect(disciplines.map((r) => r.description)).not.toContain("Grout");
  });

  it("counts grout's invalid rows against the combined row", () => {
    // The badge is keyed by discipline id, so without `alsoCovers` a bad grout
    // row would warn on the Grout sheet and nowhere on this page.
    const { disciplines } = buildSummaryRows(emptyTotals());
    const combined = disciplines.find((r) => r.description === concreteLabel);
    expect(combined?.disciplineId).toBe("concrete");
    expect(combined?.alsoCovers).toContain("grout");
  });

  it("still links to a real take-off sheet", () => {
    // The label changed, so the label→discipline lookup has to still resolve
    // or the row silently loses its route and its error badge.
    const { disciplines } = buildSummaryRows(emptyTotals());
    const combined = disciplines.find((r) => r.description === concreteLabel);
    expect(combined?.disciplineTo).toBe("/concrete");
  });
});

describe("buildSummaryRows — Craft Support Labor override", () => {
  it("fills the Craft Support Labor indirect row from its dedicated totals", () => {
    const t = emptyTotals();
    t.craftSupportLabor = 5000;
    t.craftSupportLaborHours = 100;
    const { indirects } = buildSummaryRows(t);
    const csl = indirects.find((r) => r.description === "Craft Support Labor");
    expect(csl?.totalLabor).toBe(formatMoney(5000));
    expect(csl?.hrs).toBe(formatMoney(100));
    expect(csl?.rate).toBe(formatMoney(50)); // 5000 / 100
  });

  it("leaves other indirect rows blank", () => {
    const { indirects } = buildSummaryRows(emptyTotals());
    const supervision = indirects.find((r) => r.description === "Supervision");
    expect(supervision?.totalLabor).toBe("");
    expect(supervision?.hrs).toBe("");
  });
});

describe("buildSummaryRows — L1 / L1L2 sections", () => {
  it("rolls an Engineering row up from its L1 bucket", () => {
    const t = emptyTotals();
    t.laborByL1["026"] = 800; // Detailed Engineering (Class 2-1)
    const { engineering } = buildSummaryRows(t);
    const row = engineering.find((r) =>
      r.description.startsWith("Detailed Engineering"),
    );
    expect(row?.totalLabor).toBe(formatMoney(800));
  });

  it("rolls an Admin row up from its L1+L2 sub-account bucket", () => {
    const t = emptyTotals();
    t.materialsByL1L2["01310"] = 200; // Bonds
    const { adminHomeOffice } = buildSummaryRows(t);
    const bonds = adminHomeOffice.find((r) => r.description === "Bonds");
    expect(bonds?.material).toBe(formatMoney(200));
  });
});

describe("buildSummaryRows — no data", () => {
  it("returns the section scaffolding with blank cells when totals are undefined", () => {
    const s = buildSummaryRows(undefined);
    expect(s.disciplines.length).toBeGreaterThan(0);
    expect(s.tic.length).toBeGreaterThan(0);
    // Every cell blank — nothing to roll up.
    expect(s.disciplines.every((r) => r.totalLabor === "")).toBe(true);
  });
});

describe("toSummaryExportRows", () => {
  it("tags every row with its section, in display order", () => {
    const rows = toSummaryExportRows(buildSummaryRows(emptyTotals()));
    expect(rows[0].section).toBe("Disciplines");
    expect(new Set(rows.map((r) => r.section))).toEqual(
      new Set([
        "Disciplines",
        "Indirects",
        "Administration & Home Office",
        "Engineering & Design",
        "TIC Before Contingency",
      ]),
    );
  });
});

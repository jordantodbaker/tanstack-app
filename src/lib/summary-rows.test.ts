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

describe("buildSummaryRows — Grout carve-out", () => {
  it("subtracts Grout (29X) from Concrete's digit-2 totals and adds a Grout row after it", () => {
    const t = emptyTotals();
    t.laborByDigit["2"] = 1000; // all of digit 2 (incl. grout)
    t.laborByL1["290"] = 300; // grout's share, keyed by L1
    const { disciplines } = buildSummaryRows(t);

    const grout = disciplines.find((r) => r.description === "Grout");
    const concrete = disciplines.find((r) => r.description === concreteLabel);
    expect(grout?.totalLabor).toBe(formatMoney(300));
    // Concrete keeps only the non-grout remainder — no double count.
    expect(concrete?.totalLabor).toBe(formatMoney(700));
  });

  it("inserts the Grout row immediately after Concrete", () => {
    const { disciplines } = buildSummaryRows(emptyTotals());
    const ci = disciplines.findIndex((r) => r.description === concreteLabel);
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(disciplines[ci + 1]?.description).toBe("Grout");
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

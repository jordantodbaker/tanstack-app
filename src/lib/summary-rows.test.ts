import { describe, it, expect } from "vitest";
import {
  buildSummaryRows,
  ESTIMATE_CSV_COLUMNS,
  parseMoney,
  totalCost,
  toSummaryExportRows,
  type SummaryRow,
} from "./summary-rows";
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
    t.materialsByL1L2["03205"] = 200; // Bonds
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

/**
 * The money helpers behind the Summary table and its CSV. Display cells hold
 * formatted strings, so every number makes a round trip through a comma-grouped
 * string on its way to Excel — which is the part that can go wrong silently.
 */

/** A display row with the five cost cells set and the rest blank. */
const costRow = (over: Partial<SummaryRow> = {}): SummaryRow => ({
  description: "Piping",
  qty: "",
  uom: "",
  unitRate: "",
  hrs: "",
  rate: "",
  totalLabor: "",
  material: "",
  sub: "",
  equip: "",
  other: "",
  ...over,
});

describe("parseMoney", () => {
  it("reads a comma-grouped display string back as a number", () => {
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("1,234,567.89")).toBe(1234567.89);
    expect(parseMoney("12.00")).toBe(12);
  });

  it("gives NaN for a blank or non-numeric cell", () => {
    // Callers branch on NaN to tell "no value" from zero, which is a real
    // distinction on an estimate: a blank discipline is not a free one.
    expect(parseMoney("")).toBeNaN();
    expect(parseMoney("—")).toBeNaN();
  });
});

describe("totalCost", () => {
  it("stays blank when every cost cell is blank", () => {
    // A row with nothing in it must export as empty, not as 0.00 — a zero
    // reads as a priced scope that happens to cost nothing.
    expect(totalCost(costRow())).toBe("");
  });

  it("counts blank cells as zero once any cell has a value", () => {
    // The row is priced, so the blanks are genuinely nothing rather than
    // unknown, and the total is still worth showing.
    expect(totalCost(costRow({ totalLabor: "1,000.00" }))).toBe("1,000.00");
  });

  it("adds the five cost columns", () => {
    const row = costRow({
      totalLabor: "1,000.00",
      material: "250.50",
      sub: "100.00",
      equip: "49.50",
      other: "0.00",
    });
    expect(totalCost(row)).toBe("1,400.00");
  });

  it("always shows two decimal places and groups thousands", () => {
    expect(totalCost(costRow({ material: "1000" }))).toBe("1,000.00");
    expect(totalCost(costRow({ material: "0.5" }))).toBe("0.50");
  });

  it("handles a credit without losing the sign", () => {
    const row = costRow({ totalLabor: "1,000.00", material: "-250.00" });
    expect(totalCost(row)).toBe("750.00");
  });
});

describe("ESTIMATE_CSV_COLUMNS", () => {
  const cellFor = (header: string, row: SummaryRow) =>
    ESTIMATE_CSV_COLUMNS.find((c) => c.header === header)!.get({
      section: "Disciplines",
      row,
    });

  it("emits money as numbers so Excel can sum the column", () => {
    // Strings would arrive as text and silently refuse to total.
    const cell = cellFor("Material", costRow({ material: "1,234.56" }));
    expect(cell).toBe(1234.56);
    expect(typeof cell).toBe("number");
  });

  it("round-trips Total Cost through its formatted string", () => {
    // Total Cost is the one computed column: `totalCost` formats the sum to
    // "12,345.60" and the column parses it straight back. Over 1,000 the comma
    // is in play, so a change to either side blanks the column with no error
    // anywhere — this is the assertion that would catch it.
    const row = costRow({ totalLabor: "12,000.00", material: "345.60" });
    expect(totalCost(row)).toBe("12,345.60");
    const cell = cellFor("Total Cost", row);
    expect(cell).toBe(12345.6);
    expect(typeof cell).toBe("number");
  });

  it("leaves a blank cell blank rather than writing zero", () => {
    expect(cellFor("Material", costRow())).toBe("");
    expect(cellFor("Total Cost", costRow())).toBe("");
  });

  it("keeps the text columns as text", () => {
    const row = costRow({ uom: "LF" });
    expect(cellFor("Description", row)).toBe("Piping");
    expect(cellFor("UOM", row)).toBe("LF");
    expect(cellFor("Section", row)).toBe("Disciplines");
  });
});

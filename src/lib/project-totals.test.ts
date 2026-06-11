import { describe, expect, it } from "vitest";
import {
  accumulateProjectTotals,
  type ProjectTotalsRow,
} from "./project-totals";

function row(overrides: Partial<ProjectTotalsRow>): ProjectTotalsRow {
  return {
    discipline: "",
    section: "TAKE_OFF",
    cbsCode: "",
    quantity: "0",
    laborHours: "0",
    laborRate: "0",
    materialCost: "0",
    ...overrides,
  };
}

describe("accumulateProjectTotals", () => {
  it("returns all-zero/empty buckets when given no rows", () => {
    const totals = accumulateProjectTotals([]);
    expect(totals.laborByDigit).toEqual({});
    expect(totals.laborHoursByDigit).toEqual({});
    expect(totals.quantityByDigit).toEqual({});
    expect(totals.materialsByDigit).toEqual({});
    expect(totals.craftSupportLabor).toBe(0);
    expect(totals.craftSupportLaborHours).toBe(0);
  });

  describe("digit resolution priority", () => {
    it("prefers the first character of cbsCode over the discipline mapping", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "piping", // would map to "6"
          cbsCode: "201", // first char "2" wins
          quantity: "10",
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "2": 200 });
      expect(totals.laborHoursByDigit).toEqual({ "2": 4 });
      expect(totals.quantityByDigit).toEqual({ "2": 10 });
      expect(totals.laborByDigit["6"]).toBeUndefined();
    });

    it("falls back to DISCIPLINE_TO_DIGIT when cbsCode is empty or null", () => {
      const totals = accumulateProjectTotals([
        row({
          discipline: "coatings",
          cbsCode: "",
          quantity: "1",
          laborHours: "1",
          laborRate: "100",
        }),
        row({
          discipline: "electric",
          cbsCode: null,
          quantity: "2",
          laborHours: "2",
          laborRate: "100",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "9": 100, "7": 200 });
    });

    it("falls back to the discipline's leading digit when discipline is itself a numeric code", () => {
      // For MATERIALS rows the seed sets `discipline` to the L1 code like "601".
      const totals = accumulateProjectTotals([
        row({
          discipline: "601",
          section: "MATERIALS",
          cbsCode: "",
          quantity: "3",
          materialCost: "10",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({ "6": 30 });
    });

    it("drops TAKE_OFF rows that produce no digit at all", () => {
      const totals = accumulateProjectTotals([
        row({
          discipline: "unknown-discipline",
          cbsCode: "",
          quantity: "5",
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({});
      expect(totals.laborHoursByDigit).toEqual({});
      expect(totals.quantityByDigit).toEqual({});
    });
  });

  describe("TAKE_OFF section", () => {
    it("sums labor cost, labor hours, and quantity by digit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "10",
          laborHours: "4",
          laborRate: "50",
        }),
        row({
          section: "TAKE_OFF",
          cbsCode: "699",
          quantity: "5",
          laborHours: "2",
          laborRate: "100",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "6": 4 * 50 + 2 * 100 });
      expect(totals.laborHoursByDigit).toEqual({ "6": 6 });
      expect(totals.quantityByDigit).toEqual({ "6": 15 });
    });

    it("only adds labor cost when hours > 0 (independent of qty)", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "0", // qty is zero
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      // labor cost should still count even when qty is zero
      expect(totals.laborByDigit).toEqual({ "6": 200 });
      expect(totals.laborHoursByDigit).toEqual({ "6": 4 });
      // qty is skipped because it isn't > 0
      expect(totals.quantityByDigit).toEqual({});
    });

    it("skips labor cost when hours are zero or rate is non-numeric", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "5",
          laborHours: "0",
          laborRate: "50",
        }),
        row({
          section: "TAKE_OFF",
          cbsCode: "601",
          quantity: "5",
          laborHours: "3",
          laborRate: "abc",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({});
      // quantity is still summed
      expect(totals.quantityByDigit).toEqual({ "6": 10 });
      // hours from the first row (0) is skipped; second row (3) is added
      expect(totals.laborHoursByDigit).toEqual({ "6": 3 });
    });
  });

  describe("SUPPORT_LABOR section", () => {
    it("accumulates into craftSupportLabor / craftSupportLaborHours regardless of digit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          cbsCode: "",
          laborHours: "10",
          laborRate: "75",
        }),
        row({
          section: "SUPPORT_LABOR",
          discipline: "electric",
          cbsCode: "701",
          laborHours: "5",
          laborRate: "80",
        }),
      ]);
      expect(totals.craftSupportLabor).toBe(10 * 75 + 5 * 80);
      expect(totals.craftSupportLaborHours).toBe(15);
      // SUPPORT_LABOR should NOT pollute the per-digit buckets
      expect(totals.laborByDigit).toEqual({});
      expect(totals.laborHoursByDigit).toEqual({});
    });

    it("skips hours when not finite or not positive", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "0",
          laborRate: "75",
        }),
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "abc",
          laborRate: "75",
        }),
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "4",
          laborRate: "75",
        }),
      ]);
      expect(totals.craftSupportLaborHours).toBe(4);
    });
  });

  describe("MATERIALS section", () => {
    it("accumulates qty * materialCost into materialsByDigit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "601",
          cbsCode: "",
          quantity: "10",
          materialCost: "5",
        }),
        row({
          section: "MATERIALS",
          discipline: "699",
          cbsCode: "",
          quantity: "2",
          materialCost: "25",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({ "6": 10 * 5 + 2 * 25 });
    });

    it("skips rows with non-numeric qty or materialCost", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "601",
          quantity: "abc",
          materialCost: "5",
        }),
        row({
          section: "MATERIALS",
          discipline: "601",
          quantity: "10",
          materialCost: "abc",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({});
    });

    it("skips rows that cannot resolve a digit", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "unknown",
          cbsCode: "",
          quantity: "10",
          materialCost: "5",
        }),
      ]);
      expect(totals.materialsByDigit).toEqual({});
    });
  });

  it("does not cross-pollute buckets across the three sections", () => {
    const totals = accumulateProjectTotals([
      row({
        section: "TAKE_OFF",
        cbsCode: "601",
        quantity: "10",
        laborHours: "4",
        laborRate: "50",
      }),
      row({
        section: "SUPPORT_LABOR",
        discipline: "piping",
        laborHours: "8",
        laborRate: "75",
      }),
      row({
        section: "MATERIALS",
        discipline: "601",
        quantity: "5",
        materialCost: "20",
      }),
    ]);
    expect(totals.laborByDigit).toEqual({ "6": 200 });
    expect(totals.craftSupportLabor).toBe(600);
    expect(totals.materialsByDigit).toEqual({ "6": 100 });
  });

  describe("byArea breakdown", () => {
    it("returns an empty array when given no rows", () => {
      expect(accumulateProjectTotals([]).byArea).toEqual([]);
    });

    it("aggregates direct cost per (area, digit) and indirect per area", () => {
      const totals = accumulateProjectTotals([
        // Pump House A: $200 direct piping labor + $30 material
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          laborHours: "4",
          laborRate: "50",
          area: "1",
        }),
        row({
          section: "MATERIALS",
          discipline: "601",
          quantity: "3",
          materialCost: "10",
          area: "1",
        }),
        // Pump House A: $400 indirect support labor
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          laborHours: "8",
          laborRate: "50",
          area: "1",
        }),
        // Pump House B: $100 direct civil labor
        row({
          section: "TAKE_OFF",
          discipline: "civil",
          laborHours: "2",
          laborRate: "50",
          area: "2",
        }),
        // Unassigned: $50 material
        row({
          section: "MATERIALS",
          discipline: "201",
          quantity: "5",
          materialCost: "10",
        }),
      ]);

      const byId = Object.fromEntries(
        totals.byArea.map((a) => [a.areaId, a]),
      );
      expect(byId["1"]).toEqual({
        areaId: "1",
        directByDigit: { "6": 230 }, // 200 labor + 30 material
        indirect: 400,
      });
      expect(byId["2"]).toEqual({
        areaId: "2",
        directByDigit: { "1": 100 },
        indirect: 0,
      });
      expect(byId[""]).toEqual({
        areaId: "",
        directByDigit: { "2": 50 },
        indirect: 0,
      });
    });

    it("does not emit a row for an area whose only contributions are zero", () => {
      const totals = accumulateProjectTotals([
        // labor*rate = 0 — skipped
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          laborHours: "0",
          laborRate: "50",
          area: "9",
        }),
      ]);
      expect(totals.byArea).toEqual([]);
    });
  });

  describe("invalidByDiscipline", () => {
    // `row()` defaults numeric fields to "0" so other tests can do math. For
    // the invalidness check, "0" reads as "started" — explicitly blank these
    // out below for cases that should look untouched.
    const BLANK = {
      quantity: "",
      laborHours: "",
      laborRate: "",
      materialCost: "",
    };

    it("is empty when nothing is wrong", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          laborHours: "4",
          laborRate: "50",
        }),
      ]);
      expect(totals.invalidByDiscipline).toEqual({});
    });

    it("counts Take Off rows that have user data but no computable Total", () => {
      const totals = accumulateProjectTotals([
        // touched (cbs) but no labor — invalid
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          cbsCode: "601-01",
          ...BLANK,
        }),
        // touched (qty) but no labor — invalid, same discipline
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          ...BLANK,
          quantity: "10",
        }),
        // valid — has hours and rate
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          laborHours: "4",
          laborRate: "50",
        }),
        // different discipline, invalid (hours without rate)
        row({
          section: "TAKE_OFF",
          discipline: "civil",
          ...BLANK,
          laborHours: "4",
        }),
      ]);
      expect(totals.invalidByDiscipline).toEqual({ piping: 2, civil: 1 });
    });

    it("ignores SUPPORT_LABOR and MATERIALS rows", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "SUPPORT_LABOR",
          discipline: "piping",
          ...BLANK,
          laborHours: "4",
          // missing rate — would be invalid if this were TAKE_OFF
        }),
        row({
          section: "MATERIALS",
          discipline: "601",
          ...BLANK,
          quantity: "5",
          // missing material cost — would be invalid if this were TAKE_OFF
        }),
      ]);
      expect(totals.invalidByDiscipline).toEqual({});
    });

    it("ignores untouched blank rows", () => {
      const totals = accumulateProjectTotals([
        row({ section: "TAKE_OFF", discipline: "piping", ...BLANK }),
      ]);
      expect(totals.invalidByDiscipline).toEqual({});
    });

    it("flags a row where only a picker field (e.g. schedule) is set", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "piping",
          ...BLANK,
          // Cast through the wider type so the test row carries fields not
          // in the legacy fixture; the aggregator now consumes them.
          ...({ schedule: "ST" } as Partial<{ schedule: string }>),
        }),
      ]);
      expect(totals.invalidByDiscipline).toEqual({ piping: 1 });
    });
  });

  describe("L1 (parent CBS) buckets", () => {
    it("buckets TAKE_OFF labor/hours/quantity by the 3-char L1 of the cbsCode", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "engineering",
          cbsCode: "022-10-1000-00-L",
          quantity: "5",
          laborHours: "10",
          laborRate: "100",
        }),
        row({
          section: "TAKE_OFF",
          discipline: "engineering",
          cbsCode: "024-05-0000-00-L",
          quantity: "2",
          laborHours: "4",
          laborRate: "150",
        }),
      ]);
      expect(totals.laborByL1).toEqual({ "022": 1000, "024": 600 });
      expect(totals.laborHoursByL1).toEqual({ "022": 10, "024": 4 });
      expect(totals.quantityByL1).toEqual({ "022": 5, "024": 2 });
    });

    it("separates parent CBS items that share a leading digit", () => {
      // 022 and 024 are both digit "0" — the coarse digit bucket lumps them,
      // but the L1 buckets keep them distinct (what the Engineering section needs).
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "engineering",
          cbsCode: "022-10-1000-00-L",
          laborHours: "10",
          laborRate: "100",
        }),
        row({
          section: "TAKE_OFF",
          discipline: "engineering",
          cbsCode: "024-05-0000-00-L",
          laborHours: "4",
          laborRate: "150",
        }),
      ]);
      expect(totals.laborByDigit).toEqual({ "0": 1600 });
      expect(totals.laborByL1).toEqual({ "022": 1000, "024": 600 });
    });

    it("buckets MATERIALS by L1 using the discipline code when cbsCode is empty", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "024",
          cbsCode: "",
          quantity: "2",
          materialCost: "50",
        }),
      ]);
      expect(totals.materialsByL1).toEqual({ "024": 100 });
    });
  });

  describe("L1+L2 (sub-account) buckets", () => {
    it("buckets TAKE_OFF by the de-dashed 5-char L1+L2 prefix", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "TAKE_OFF",
          discipline: "administration",
          cbsCode: "013-10-2000-00-O",
          laborHours: "8",
          laborRate: "100",
        }),
        row({
          section: "TAKE_OFF",
          discipline: "administration",
          cbsCode: "013-20-0000-00-O",
          laborHours: "5",
          laborRate: "100",
        }),
      ]);
      expect(totals.laborByL1L2).toEqual({ "01310": 800, "01320": 500 });
      // The L1 bucket still rolls both L2s up under "013".
      expect(totals.laborByL1).toEqual({ "013": 1300 });
    });

    it("buckets MATERIALS by L1+L2", () => {
      const totals = accumulateProjectTotals([
        row({
          section: "MATERIALS",
          discipline: "012",
          cbsCode: "012-80-3000-00-O",
          quantity: "2",
          materialCost: "50",
        }),
      ]);
      expect(totals.materialsByL1L2).toEqual({ "01280": 100 });
    });
  });
});

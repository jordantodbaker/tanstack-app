import { describe, expect, it } from "vitest";
import {
  computePeriodEvm,
  type ComputePeriodEvmInput,
  type PeriodMeasurementInput,
} from "./period-evm";
import type { ProjectFefRowTotals } from "./project-totals";

function totals(
  overrides: Partial<ProjectFefRowTotals> = {},
): ProjectFefRowTotals {
  return {
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
    byArea: [],
    invalidByDiscipline: {},
    ...overrides,
  };
}

function meas(
  bucket: string,
  overrides: Partial<PeriodMeasurementInput> = {},
): PeriodMeasurementInput {
  return {
    bucket,
    percentComplete: 0,
    actualCost: 0,
    actualHours: null,
    plannedValueOverride: null,
    notes: "",
    ...overrides,
  };
}

function input(
  overrides: Partial<ComputePeriodEvmInput> = {},
): ComputePeriodEvmInput {
  return {
    baselineTotals: totals(),
    revisionsByBucket: {},
    measurements: [],
    projectStartDate: null,
    projectEndDate: null,
    dataDate: "2026-06-15",
    ...overrides,
  };
}

describe("computePeriodEvm", () => {
  describe("bucket union", () => {
    it("includes a bucket present only in the baseline snapshot", () => {
      // Snapshot has BAC for bucket "6" but no measurement, no revisions.
      // The bucket should still surface with zero EV / AC.
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({ laborByDigit: { "6": 1000 } }),
        }),
      );
      expect(buckets.map((b) => b.bucket)).toEqual(["6"]);
      expect(buckets[0].metrics.bac).toBe(1000);
      expect(buckets[0].metrics.ev).toBe(0);
    });

    it("includes a bucket present only in CVR revisions (BAC = 0)", () => {
      // A CVR attributed to a discipline the snapshot doesn't cover should
      // still appear in the table with currentBudget > BAC.
      const { buckets } = computePeriodEvm(
        input({ revisionsByBucket: { "9": 5000 } }),
      );
      expect(buckets.map((b) => b.bucket)).toEqual(["9"]);
      expect(buckets[0].metrics.bac).toBe(0);
      expect(buckets[0].metrics.currentBudget).toBe(5000);
    });

    it("includes a bucket present only in a measurement", () => {
      // PM entered actuals against a discipline not in the snapshot — still
      // surface so the unattributed cost is visible rather than dropped.
      const { buckets } = computePeriodEvm(
        input({ measurements: [meas("3", { actualCost: 250 })] }),
      );
      expect(buckets.map((b) => b.bucket)).toEqual(["3"]);
      expect(buckets[0].metrics.ac).toBe(250);
    });

    it("sorts buckets alphabetically for stable output", () => {
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({
            laborByDigit: { "7": 100, "1": 100, "6": 100 },
          }),
        }),
      );
      expect(buckets.map((b) => b.bucket)).toEqual(["1", "6", "7"]);
    });
  });

  describe("BAC composition", () => {
    it("sums labor and materials per bucket for the BAC", () => {
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({
            laborByDigit: { "6": 600 },
            materialsByDigit: { "6": 400 },
          }),
        }),
      );
      expect(buckets[0].metrics.bac).toBe(1000);
    });
  });

  describe("PV source resolution", () => {
    it("uses plannedValueOverride when set (wins over time-linear)", () => {
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({ laborByDigit: { "6": 1000 } }),
          measurements: [meas("6", { plannedValueOverride: 250 })],
          projectStartDate: "2026-01-01",
          projectEndDate: "2026-12-31",
          dataDate: "2026-06-15",
        }),
      );
      expect(buckets[0].pvSource).toBe("override");
      expect(buckets[0].metrics.pv).toBe(250);
    });

    it("falls back to time-linear PV when no override and both dates set", () => {
      // Midpoint of 2026 → ~50% of $1000 BAC.
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({ laborByDigit: { "6": 1000 } }),
          projectStartDate: "2026-01-01",
          projectEndDate: "2026-12-31",
          dataDate: "2026-07-02",
        }),
      );
      expect(buckets[0].pvSource).toBe("time-linear");
      expect(buckets[0].metrics.pv).toBeGreaterThan(490);
      expect(buckets[0].metrics.pv).toBeLessThan(510);
    });

    it("uses pvSource='none' when no override and missing project dates", () => {
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({ laborByDigit: { "6": 1000 } }),
          measurements: [meas("6", { percentComplete: 0.5 })],
          projectStartDate: null,
          projectEndDate: "2026-12-31",
        }),
      );
      expect(buckets[0].pvSource).toBe("none");
      expect(buckets[0].metrics.pv).toBe(0);
      // Downstream effect: SPI is null when PV = 0.
      expect(buckets[0].metrics.spi).toBeNull();
    });

    it("uses pvSource='none' when project dates are set but data date is before start", () => {
      // time-linear would produce 0 because the data date predates start.
      // We treat that as no signal rather than a real "zero plan."
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({ laborByDigit: { "6": 1000 } }),
          projectStartDate: "2026-06-01",
          projectEndDate: "2026-12-31",
          dataDate: "2026-01-15",
        }),
      );
      expect(buckets[0].pvSource).toBe("none");
      expect(buckets[0].metrics.pv).toBe(0);
    });
  });

  describe("measurement defaults", () => {
    it("defaults to zero percent complete / zero AC when no measurement exists", () => {
      const { buckets } = computePeriodEvm(
        input({
          baselineTotals: totals({ laborByDigit: { "6": 1000 } }),
        }),
      );
      expect(buckets[0].percentComplete).toBe(0);
      expect(buckets[0].actualCost).toBe(0);
      expect(buckets[0].actualHours).toBeNull();
    });
  });

  describe("project total aggregation", () => {
    it("aggregates per-bucket metrics into a project-total row", () => {
      // Two buckets — civil over budget, piping under. Project CPI should
      // reflect the cost-weighted reality, not the average of bucket CPIs.
      const { total } = computePeriodEvm(
        input({
          baselineTotals: totals({
            laborByDigit: { "1": 100, "6": 900 },
          }),
          measurements: [
            meas("1", { percentComplete: 1, actualCost: 150 }), // 50% over a $100 BAC
            meas("6", { percentComplete: 1, actualCost: 700 }), // 22% under a $900 BAC
          ],
        }),
      );
      expect(total.bac).toBe(1000);
      expect(total.ev).toBe(1000);
      expect(total.ac).toBe(850);
      // CPI weighted by cost: 1000 / 850 ≈ 1.176 (dominated by piping).
      expect(total.cpi).toBeCloseTo(1000 / 850, 3);
    });
  });
});

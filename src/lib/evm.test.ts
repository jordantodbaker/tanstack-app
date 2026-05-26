import { describe, expect, it } from "vitest";
import {
  aggregateEvm,
  computeEvm,
  timeLinearPv,
  type EvmInputs,
} from "./evm";

function inp(overrides: Partial<EvmInputs> = {}): EvmInputs {
  return {
    bac: 1000,
    budgetRevisions: 0,
    percentComplete: 0,
    actualCost: 0,
    pv: 0,
    ...overrides,
  };
}

describe("computeEvm", () => {
  describe("baseline math", () => {
    it("on-budget, on-schedule project produces CPI/SPI of 1", () => {
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 0.5,
        actualCost: 500,
        pv: 500,
      }));
      expect(m.ev).toBe(500);
      expect(m.cv).toBe(0);
      expect(m.sv).toBe(0);
      expect(m.cpi).toBe(1);
      expect(m.spi).toBe(1);
      expect(m.eac).toBe(1000);
      expect(m.vac).toBe(0);
    });

    it("under-budget project has CPI > 1 and EAC < BAC", () => {
      // 50% done, spent 400 (vs 500 planned) — running cheaper than plan
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 0.5,
        actualCost: 400,
        pv: 500,
      }));
      expect(m.ev).toBe(500);
      expect(m.cv).toBe(100);          // EV − AC = 500 − 400
      expect(m.cpi).toBe(1.25);        // 500 / 400
      expect(m.eac).toBe(800);         // 1000 / 1.25
      expect(m.vac).toBe(200);         // 1000 − 800
    });

    it("over-budget project has CPI < 1 and EAC > BAC", () => {
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 0.5,
        actualCost: 600,
        pv: 500,
      }));
      expect(m.cv).toBe(-100);
      expect(m.cpi).toBeCloseTo(0.833, 3);
      expect(m.eac).toBeCloseTo(1200, 1);
      expect(m.vac).toBeCloseTo(-200, 1);
    });

    it("ahead-of-schedule project has SPI > 1 and positive SV", () => {
      // We were supposed to be 40% done; we're 50% done.
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 0.5,
        actualCost: 500,
        pv: 400,
      }));
      expect(m.sv).toBe(100);
      expect(m.spi).toBe(1.25);
    });
  });

  describe("budget revisions (CVRs)", () => {
    it("currentBudget includes approved revisions; BAC stays at the snapshot baseline", () => {
      const m = computeEvm(inp({
        bac: 1000,
        budgetRevisions: 250,
        percentComplete: 0.5,
        actualCost: 600,
        pv: 500,
      }));
      expect(m.bac).toBe(1000);
      expect(m.currentBudget).toBe(1250);
      // EAC is forecast from BAC (the baseline), not currentBudget — the
      // forecast uses the bid number as the production basis. VAC compares
      // that forecast against the *authorized* (revised) budget.
      expect(m.eac).toBeCloseTo(1200, 1);
      expect(m.vac).toBeCloseTo(50, 1);  // 1250 − 1200, we have headroom
    });
  });

  describe("divide-by-zero edges", () => {
    it("AC = 0 → CPI is null and EAC falls back to BAC", () => {
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 0,
        actualCost: 0,
        pv: 0,
      }));
      expect(m.cpi).toBeNull();
      expect(m.eac).toBe(1000);
      expect(m.etc).toBe(1000);
    });

    it("PV = 0 → SPI is null", () => {
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 0.5,
        actualCost: 500,
        pv: 0,
      }));
      expect(m.spi).toBeNull();
      // CV / CPI should still be defined normally
      expect(m.cv).toBe(0);
      expect(m.cpi).toBe(1);
    });

    it("BAC = 0 → ev/cv/eac/vac all zero, no NaN", () => {
      const m = computeEvm(inp({
        bac: 0,
        percentComplete: 0.5,
        actualCost: 0,
        pv: 0,
      }));
      expect(m.ev).toBe(0);
      expect(m.cv).toBe(0);
      expect(m.eac).toBe(0);
      expect(m.vac).toBe(0);
    });
  });

  describe("input hardening", () => {
    it("clamps percentComplete above 1 (typo guard)", () => {
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: 1.5,
        actualCost: 500,
        pv: 500,
      }));
      // EV capped at BAC; we can never earn more than budgeted.
      expect(m.ev).toBe(1000);
    });

    it("clamps percentComplete below 0", () => {
      const m = computeEvm(inp({
        bac: 1000,
        percentComplete: -0.3,
      }));
      expect(m.ev).toBe(0);
    });

    it("treats NaN/Infinity inputs as zero rather than propagating", () => {
      const m = computeEvm({
        bac: Number.NaN,
        budgetRevisions: Number.POSITIVE_INFINITY,
        percentComplete: Number.NaN,
        actualCost: Number.NaN,
        pv: Number.NaN,
      });
      expect(m.bac).toBe(0);
      expect(m.ev).toBe(0);
      expect(m.cv).toBe(0);
    });
  });
});

describe("aggregateEvm", () => {
  it("returns all-zero metrics for an empty bucket set", () => {
    const m = aggregateEvm([]);
    expect(m.bac).toBe(0);
    expect(m.ev).toBe(0);
    expect(m.cpi).toBeNull();
    expect(m.spi).toBeNull();
  });

  it("sums cost-shaped fields and recomputes ratios from the totals", () => {
    // Two buckets — one over, one under. The project-level CPI should reflect
    // weighted reality, not the average of the two bucket CPIs.
    const big = computeEvm(inp({
      bac: 900,
      percentComplete: 1.0,
      actualCost: 1200,  // 25% over on a $900 bucket → −$300
      pv: 900,
    }));
    const small = computeEvm(inp({
      bac: 100,
      percentComplete: 1.0,
      actualCost: 50,    // 50% under on a $100 bucket → +$50
      pv: 100,
    }));
    const total = aggregateEvm([big, small]);
    expect(total.bac).toBe(1000);
    expect(total.ev).toBe(1000);
    expect(total.ac).toBe(1250);
    // Project CPI = 1000 / 1250 = 0.8 — dominated by the big over-budget bucket.
    expect(total.cpi).toBe(0.8);
    // NOT the simple average ((1.25 + 0.75 + 2.0)/3 etc.) — that's the whole point.
  });

  it("preserves null ratios when total AC is 0", () => {
    const a = computeEvm(inp({ bac: 100, percentComplete: 0 }));
    const b = computeEvm(inp({ bac: 200, percentComplete: 0 }));
    const total = aggregateEvm([a, b]);
    expect(total.cpi).toBeNull();
    expect(total.spi).toBeNull();
  });
});

describe("timeLinearPv", () => {
  const start = "2026-01-01";
  const end = "2026-12-31";

  it("returns 0 when start or end is missing", () => {
    expect(timeLinearPv(1000, null, end, "2026-06-15")).toBe(0);
    expect(timeLinearPv(1000, start, null, "2026-06-15")).toBe(0);
  });

  it("returns 0 when end <= start", () => {
    expect(timeLinearPv(1000, "2026-06-01", "2026-05-01", "2026-06-15")).toBe(
      0,
    );
  });

  it("returns ~50% of BAC at the project midpoint", () => {
    const pv = timeLinearPv(1000, start, end, "2026-07-02");
    expect(pv).toBeGreaterThan(490);
    expect(pv).toBeLessThan(510);
  });

  it("clamps to 0 before the project starts", () => {
    expect(timeLinearPv(1000, start, end, "2025-12-15")).toBe(0);
  });

  it("clamps to BAC after the project ends", () => {
    expect(timeLinearPv(1000, start, end, "2027-03-01")).toBe(1000);
  });
});

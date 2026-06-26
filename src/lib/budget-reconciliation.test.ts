import { describe, expect, it } from "vitest";
import { computeBudgetReconciliation } from "./budget-reconciliation";

describe("computeBudgetReconciliation", () => {
  it("walks the chain: asBid + approved = current; + trend = afc", () => {
    const { byBucket } = computeBudgetReconciliation({
      asBidByBucket: { piping: 1000 },
      approvedByBucket: { piping: 250 },
      trendByBucket: { piping: 100 },
    });
    expect(byBucket).toEqual([
      {
        bucket: "piping",
        asBid: 1000,
        approvedChange: 250,
        currentBudget: 1250,
        weightedTrend: 100,
        afc: 1350,
      },
    ]);
  });

  it("unions buckets across all three inputs (a change with no as-bid surfaces)", () => {
    const { byBucket } = computeBudgetReconciliation({
      asBidByBucket: { civil: 500 },
      approvedByBucket: { piping: 300 }, // piping has no as-bid line
      trendByBucket: { electric: 50 }, // electric only in trends
    });
    expect(byBucket.map((r) => r.bucket)).toEqual([
      "civil",
      "electric",
      "piping",
    ]);
    const piping = byBucket.find((r) => r.bucket === "piping")!;
    expect(piping.asBid).toBe(0);
    expect(piping.currentBudget).toBe(300);
    const electric = byBucket.find((r) => r.bucket === "electric")!;
    expect(electric.afc).toBe(50);
  });

  it("sums the grand total across buckets", () => {
    const { total } = computeBudgetReconciliation({
      asBidByBucket: { a: 1000, b: 2000 },
      approvedByBucket: { a: 100, b: -300 },
      trendByBucket: { a: 50 },
    });
    expect(total).toEqual({
      bucket: "",
      asBid: 3000,
      approvedChange: -200,
      currentBudget: 2800,
      weightedTrend: 50,
      afc: 2850,
    });
  });

  it("handles a credit (negative) change reducing the current budget", () => {
    const { byBucket } = computeBudgetReconciliation({
      asBidByBucket: { a: 1000 },
      approvedByBucket: { a: -400 },
    });
    expect(byBucket[0].currentBudget).toBe(600);
    expect(byBucket[0].afc).toBe(600); // no trends → afc === currentBudget
  });

  it("omitting trends makes afc equal currentBudget", () => {
    const { byBucket } = computeBudgetReconciliation({
      asBidByBucket: { a: 800 },
      approvedByBucket: { a: 200 },
    });
    expect(byBucket[0].afc).toBe(1000);
  });

  it("returns a zeroed total for empty inputs", () => {
    const { byBucket, total } = computeBudgetReconciliation({
      asBidByBucket: {},
      approvedByBucket: {},
    });
    expect(byBucket).toEqual([]);
    expect(total).toEqual({
      bucket: "",
      asBid: 0,
      approvedChange: 0,
      currentBudget: 0,
      weightedTrend: 0,
      afc: 0,
    });
  });

  it("coerces non-finite inputs to 0", () => {
    const { byBucket } = computeBudgetReconciliation({
      asBidByBucket: { a: Number.NaN },
      approvedByBucket: { a: Infinity },
      trendByBucket: { a: 25 },
    });
    expect(byBucket[0]).toEqual({
      bucket: "a",
      asBid: 0,
      approvedChange: 0,
      currentBudget: 0,
      weightedTrend: 25,
      afc: 25,
    });
  });
});

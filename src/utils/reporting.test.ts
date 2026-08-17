import { describe, it, expect } from "vitest";
import { bacByBucket } from "~/lib/bac-buckets";
import type { ProjectFefRowTotals } from "~/lib/project-totals";

/** `bacByBucket` only reads `laborByL1` / `materialsByL1`; the rest of the
 *  totals shape is irrelevant here, so build a minimal stand-in. */
const totals = (
  laborByL1: Record<string, number>,
  materialsByL1: Record<string, number>,
): ProjectFefRowTotals =>
  ({ laborByL1, materialsByL1 }) as unknown as ProjectFefRowTotals;

describe("bacByBucket", () => {
  it("sums labor + materials per bucket (identity key = bacByL1)", () => {
    const out = bacByBucket(
      totals({ "010": 100, "020": 50 }, { "010": 25 }),
      (l1) => l1,
    );
    expect(out).toEqual({ "010": 125, "020": 50 });
  });

  it("collapses multiple L1s into one bucket via keyOf", () => {
    const out = bacByBucket(
      totals({ "010": 100, "011": 40 }, { "012": 10 }),
      (l1) => l1.slice(0, 2), // all "01x" → one "01" bucket
    );
    expect(out).toEqual({ "01": 150 });
  });

  it("drops a bucket's cost when keyOf returns undefined", () => {
    const out = bacByBucket(
      totals({ "010": 100, "999": 5 }, {}),
      (l1) => (l1 === "999" ? undefined : "keep"),
    );
    expect(out).toEqual({ keep: 100 });
  });

  it("keeps an empty-string bucket (identity key never drops it)", () => {
    // Guards the edge the `key === undefined` check preserves: an "" L1 stays,
    // it isn't treated as falsy-and-dropped.
    const out = bacByBucket(totals({ "": 30 }, {}), (l1) => l1);
    expect(out).toEqual({ "": 30 });
  });

  it("skips zero amounts so no empty buckets appear", () => {
    const out = bacByBucket(totals({ "010": 0 }, { "020": 0 }), (l1) => l1);
    expect(out).toEqual({});
  });
});

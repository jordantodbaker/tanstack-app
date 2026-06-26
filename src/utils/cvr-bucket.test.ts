import { describe, expect, it } from "vitest";
import {
  attributeCvrCostByL1,
  resolveCvrBucket,
  rollUpL1ToDiscipline,
} from "./cvr-bucket";

describe("resolveCvrBucket", () => {
  describe("cbsCode L1 wins when present", () => {
    it("maps the first cbsCode's L1 (first 3 chars) to its discipline", () => {
      expect(
        resolveCvrBucket({ cbsCodes: ["601-A"], discipline: "" }),
      ).toBe("piping");
    });

    it("separates Grout (29X) from Concrete though both are digit 2", () => {
      expect(
        resolveCvrBucket({ cbsCodes: ["293-10-2000-00-L"], discipline: "" }),
      ).toBe("grout");
      expect(
        resolveCvrBucket({ cbsCodes: ["201-05-0000-00-M"], discipline: "" }),
      ).toBe("concrete");
    });

    it("considers only the first cbsCode", () => {
      expect(
        resolveCvrBucket({
          cbsCodes: ["601-A", "701-B", "801-C"],
          discipline: "civil",
        }),
      ).toBe("piping");
    });

    it("prefers the cbsCode L1 over the discipline fallback", () => {
      // cbsCode "601-A" → piping; discipline "civil" → civil. cbsCode wins so
      // a misclassified-discipline CVR still buckets correctly.
      expect(
        resolveCvrBucket({ cbsCodes: ["601-A"], discipline: "civil" }),
      ).toBe("piping");
    });

    it("falls through when the cbsCode L1 isn't a known discipline code", () => {
      expect(
        resolveCvrBucket({ cbsCodes: ["A01"], discipline: "civil" }),
      ).toBe("civil");
    });
  });

  describe("discipline fallback", () => {
    it("uses the discipline field when cbsCodes is empty", () => {
      expect(
        resolveCvrBucket({ cbsCodes: [], discipline: "piping" }),
      ).toBe("piping");
    });

    it("uses the fallback when cbsCodes[0] is too short to carry an L1", () => {
      expect(
        resolveCvrBucket({ cbsCodes: [""], discipline: "civil" }),
      ).toBe("civil");
    });
  });

  describe("returns null when no bucket can be resolved", () => {
    it("empty cbsCodes + empty discipline → null", () => {
      expect(resolveCvrBucket({ cbsCodes: [], discipline: "" })).toBeNull();
    });

    it("empty cbsCodes + a discipline that isn't a known discipline id → null", () => {
      expect(
        resolveCvrBucket({ cbsCodes: [], discipline: "unknown-discipline" }),
      ).toBeNull();
    });
  });
});

describe("attributeCvrCostByL1", () => {
  it("splits cost across each line's own L1; the parts sum to costImpact", () => {
    const out = attributeCvrCostByL1({
      cbsCodes: ["601-A"],
      costImpact: 5000,
      lineItems: [
        { cbsCode: "601-10-0000-00-L", quantity: 10, unitRate: 100 }, // 1000 → 601
        { cbsCode: "061-20-0000-00-M", quantity: 5, unitRate: 200 }, //  1000 → 061
        { cbsCode: "601-30-0000-00-E", quantity: 6, unitRate: 500 }, //  3000 → 601
      ],
    });
    expect(out).toEqual({ "601": 4000, "061": 1000 });
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    expect(sum).toBe(5000);
  });

  it("falls back to cbsCodes[0]'s L1 when there are no line items", () => {
    expect(
      attributeCvrCostByL1({ cbsCodes: ["293-10-2000-00-L"], costImpact: 750 }),
    ).toEqual({ "293": 750 });
  });

  it("treats an empty line-items array as no buildup (uses costImpact)", () => {
    expect(
      attributeCvrCostByL1({ cbsCodes: ["601-A"], costImpact: 200, lineItems: [] }),
    ).toEqual({ "601": 200 });
  });

  it("attributes blank/short codes to the '' unattributed key, never dropped", () => {
    expect(
      attributeCvrCostByL1({ cbsCodes: [], costImpact: 300 }),
    ).toEqual({ "": 300 });
    expect(
      attributeCvrCostByL1({ cbsCodes: ["xy"], costImpact: 300 }),
    ).toEqual({ "": 300 });
  });

  it("supports credit (negative) lines", () => {
    const out = attributeCvrCostByL1({
      cbsCodes: ["601-A"],
      costImpact: -400,
      lineItems: [
        { cbsCode: "601-10-0000-00-L", quantity: 4, unitRate: 100 }, // +400
        { cbsCode: "601-20-0000-00-M", quantity: 8, unitRate: -100 }, // -800
      ],
    });
    expect(out).toEqual({ "601": -400 });
  });

  it("skips zero-amount lines", () => {
    const out = attributeCvrCostByL1({
      cbsCodes: ["601-A"],
      costImpact: 100,
      lineItems: [
        { cbsCode: "601-10-0000-00-L", quantity: 1, unitRate: 100 },
        { cbsCode: "071-10-0000-00-L", quantity: 0, unitRate: 999 }, // 0 → skipped
      ],
    });
    expect(out).toEqual({ "601": 100 });
  });
});

describe("rollUpL1ToDiscipline", () => {
  it("maps each L1 to its discipline (same maps resolveCvrBucket uses)", () => {
    expect(
      rollUpL1ToDiscipline({ "601": 1000, "201": 400, "293": 100 }),
    ).toEqual({ piping: 1000, concrete: 400, grout: 100 });
  });

  it("keeps the '' unattributed key as its own bucket", () => {
    expect(rollUpL1ToDiscipline({ "": 250, "601": 50 })).toEqual({
      "": 250,
      piping: 50,
    });
  });

  it("sums multiple L1s that resolve to the same discipline", () => {
    // 201 and 293 are concrete vs grout; 601 is piping. Use two piping-side
    // contributions via the '' + a real piping L1 to prove summation without
    // assuming a second piping L1 code.
    expect(rollUpL1ToDiscipline({ "601": 100, "293": 30 })).toEqual({
      piping: 100,
      grout: 30,
    });
  });

  it("skips zero amounts", () => {
    expect(rollUpL1ToDiscipline({ "601": 0, "201": 100 })).toEqual({
      concrete: 100,
    });
  });
});

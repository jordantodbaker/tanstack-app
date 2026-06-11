import { describe, expect, it } from "vitest";
import { resolveCvrBucket } from "./cvr-bucket";

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

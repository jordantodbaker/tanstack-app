import { describe, expect, it } from "vitest";
import { resolveCvrBucket } from "./cvr-bucket";

describe("resolveCvrBucket", () => {
  describe("cbsCodes wins when present", () => {
    it("returns the first character of the first cbsCode", () => {
      expect(
        resolveCvrBucket({ cbsCodes: ["601-A"], discipline: "" }),
      ).toBe("6");
    });

    it("ignores subsequent cbsCodes — only the first is considered", () => {
      // Multi-code CVRs (cross-discipline) are attributed to their primary
      // (first) code rather than spread or aggregated; this matches how the
      // Summary page picks a primary digit per FefRow.
      expect(
        resolveCvrBucket({
          cbsCodes: ["601-A", "701-B", "801-C"],
          discipline: "civil",
        }),
      ).toBe("6");
    });

    it("prefers cbsCode over the discipline fallback when both could resolve", () => {
      // cbsCode "601-A" → "6"; discipline "civil" → "1". cbsCode wins so
      // misclassified-discipline CVRs still bucket correctly.
      expect(
        resolveCvrBucket({
          cbsCodes: ["601-A"],
          discipline: "civil",
        }),
      ).toBe("6");
    });

    it("returns whatever character the cbsCode starts with — no digit check", () => {
      // Documents the current behavior: bucket strings are taken verbatim
      // from the first character. In practice CBS codes are numeric, so
      // this only matters if a non-numeric code is ever introduced.
      expect(
        resolveCvrBucket({ cbsCodes: ["A01"], discipline: "" }),
      ).toBe("A");
    });
  });

  describe("discipline fallback", () => {
    it("uses DISCIPLINE_TO_DIGIT when cbsCodes is empty", () => {
      expect(
        resolveCvrBucket({ cbsCodes: [], discipline: "piping" }),
      ).toBe("6");
    });

    it("uses the fallback when cbsCodes[0] is the empty string", () => {
      // A bad client could send `[""]`; fall through rather than returning
      // an empty bucket string.
      expect(
        resolveCvrBucket({ cbsCodes: [""], discipline: "civil" }),
      ).toBe("1");
    });
  });

  describe("returns null when no bucket can be resolved", () => {
    it("empty cbsCodes + unknown discipline → null", () => {
      // The caller skips the revision rather than mis-attributing to a
      // default bucket. Tested both ways: completely empty discipline...
      expect(
        resolveCvrBucket({ cbsCodes: [], discipline: "" }),
      ).toBeNull();
    });

    it("empty cbsCodes + discipline not in the mapping → null", () => {
      // ...and a discipline string that doesn't appear in DISCIPLINE_TO_DIGIT.
      expect(
        resolveCvrBucket({ cbsCodes: [], discipline: "unknown-discipline" }),
      ).toBeNull();
    });
  });
});

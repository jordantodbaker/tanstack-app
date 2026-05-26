import { describe, expect, it } from "vitest";
import { deriveLaborHours } from "./cells";

type Lookup = Map<string, { unit: string; values: Map<number, number> }>;

function mkLookup(): Lookup {
  // Two task codes, each with a couple of (size → factor) pairs.
  // Modeled after the real PipingFactorLookup shape.
  return new Map([
    [
      "WLD-CS-SCH40",
      {
        unit: "EA",
        values: new Map([
          [4, 0.5],
          [6, 0.75],
        ]),
      },
    ],
    [
      "INST-PIPE",
      {
        unit: "LF",
        values: new Map([
          [4, 0.2],
        ]),
      },
    ],
  ]);
}

describe("deriveLaborHours", () => {
  it("returns factor × quantity to one decimal when all inputs present", () => {
    const lookup = mkLookup();
    // factor for WLD-CS-SCH40 at size 4 = 0.5. qty 100 → 50.0.
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "4", quantity: "100" },
        lookup,
      ),
    ).toBe("50.0");
  });

  it("rounds to one decimal place", () => {
    const lookup = mkLookup();
    // factor 0.75 × qty 7 = 5.25 → "5.3" (toFixed rounds half-to-even in Node).
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "6", quantity: "7" },
        lookup,
      ),
    ).toBe("5.3");
  });

  it("returns empty string when taskCode is blank", () => {
    expect(
      deriveLaborHours(
        { taskCode: "", size: "4", quantity: "100" },
        mkLookup(),
      ),
    ).toBe("");
  });

  it("returns empty string when size is blank", () => {
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "", quantity: "100" },
        mkLookup(),
      ),
    ).toBe("");
  });

  it("returns empty string when quantity is blank", () => {
    // Blank qty is a distinct case from numeric zero — we don't compute,
    // because the row hasn't been "touched" with a quantity yet.
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "4", quantity: "" },
        mkLookup(),
      ),
    ).toBe("");
  });

  it("returns empty string when quantity is non-numeric", () => {
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "4", quantity: "abc" },
        mkLookup(),
      ),
    ).toBe("");
  });

  it("returns empty string when the lookup is undefined", () => {
    // Before the factor data finishes loading on the client, the lookup
    // can be undefined — should be a no-op rather than crashing.
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "4", quantity: "100" },
        undefined,
      ),
    ).toBe("");
  });

  it("returns empty string when the taskCode isn't in the lookup", () => {
    expect(
      deriveLaborHours(
        { taskCode: "UNKNOWN-CODE", size: "4", quantity: "100" },
        mkLookup(),
      ),
    ).toBe("");
  });

  it("returns empty string when the size has no entry for this taskCode", () => {
    // WLD-CS-SCH40 has factors for sizes 4 and 6, but not 8.
    expect(
      deriveLaborHours(
        { taskCode: "WLD-CS-SCH40", size: "8", quantity: "100" },
        mkLookup(),
      ),
    ).toBe("");
  });

  it("treats numeric-string size correctly (parseFloat)", () => {
    // Size "4" should map to the lookup key 4 (number), not the string "4".
    expect(
      deriveLaborHours(
        { taskCode: "INST-PIPE", size: "4", quantity: "200" },
        mkLookup(),
      ),
    ).toBe("40.0"); // 0.2 × 200 = 40
  });
});

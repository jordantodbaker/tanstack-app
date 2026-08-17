import { describe, it, expect } from "vitest";
import { priorityToRiskLevel, FCO_PRIORITIES } from "./fcoLog";

describe("priorityToRiskLevel", () => {
  it("maps each FCO priority to the CVR risk level it escalates into", () => {
    expect(priorityToRiskLevel("URGENT")).toBe("CRITICAL");
    expect(priorityToRiskLevel("HIGH")).toBe("HIGH");
    expect(priorityToRiskLevel("LOW")).toBe("LOW");
    expect(priorityToRiskLevel("NORMAL")).toBe("MEDIUM");
  });

  it("returns a value for every defined priority (nothing falls through)", () => {
    for (const p of FCO_PRIORITIES) {
      expect(priorityToRiskLevel(p)).toBeTruthy();
    }
  });
});

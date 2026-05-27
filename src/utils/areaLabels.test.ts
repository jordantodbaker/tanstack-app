import { describe, expect, it } from "vitest";
import { formatAreaLabel, type LabeledArea } from "./areaLabels";

const areas: LabeledArea[] = [
  { id: 1, displayId: "A-01", name: "North Yard" },
  { id: 2, displayId: "A-02", name: "" },
];

describe("formatAreaLabel", () => {
  it("returns an empty string when the raw id is empty (project-wide)", () => {
    expect(formatAreaLabel("", areas)).toBe("");
  });

  it('emits "displayId — name" for a matched area with a name', () => {
    expect(formatAreaLabel("1", areas)).toBe("A-01 — North Yard");
  });

  it("emits the displayId alone when the matched area has no name", () => {
    expect(formatAreaLabel("2", areas)).toBe("A-02");
  });

  it("falls back to the raw value when no area matches (legacy free-text passthrough)", () => {
    expect(formatAreaLabel("unknown-99", areas)).toBe("unknown-99");
  });

  it("compares area ids as strings so numeric/string ids both match", () => {
    // The stored value on ChangeLog.area / FCO.locationArea is a string; the
    // Area row id is a number. Coercion has to happen on the area side.
    expect(formatAreaLabel("1", areas)).toBe("A-01 — North Yard");
    const stringIdAreas: LabeledArea[] = [
      { id: "1", displayId: "A-01", name: "North Yard" },
    ];
    expect(formatAreaLabel("1", stringIdAreas)).toBe("A-01 — North Yard");
  });
});

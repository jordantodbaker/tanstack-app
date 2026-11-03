import { describe, expect, it } from "vitest";
import {
  CHANGE_ENTITIES,
  CHANGE_ENTITY_TYPES,
  formatRecordRef,
  isChangeEntityType,
  recordNumber,
} from "./change-entities";

/**
 * The registry the entity catalogs derive from, and the one way a record is
 * named. A sixth record type lands here first; the drift guards in
 * `recent-entities.test.ts` then say what else has to follow.
 */

describe("CHANGE_ENTITIES", () => {
  it("covers exactly the five change-pipeline records", () => {
    expect([...CHANGE_ENTITY_TYPES].sort()).toEqual([
      "ChangeLog",
      "FieldChangeOrder",
      "Pco",
      "Rfi",
      "Trend",
    ]);
    expect(Object.keys(CHANGE_ENTITIES).sort()).toEqual(
      [...CHANGE_ENTITY_TYPES].sort(),
    );
  });

  it("gives every record a noun, a list page and a number prefix", () => {
    for (const t of CHANGE_ENTITY_TYPES) {
      const def = CHANGE_ENTITIES[t];
      expect(def.noun.length).toBeGreaterThan(0);
      expect(def.listPath.startsWith("/")).toBe(true);
      expect(def.number.prefix.endsWith("-")).toBe(true);
      expect(def.number.padWidth).toBeGreaterThan(0);
    }
  });

  it("recognises its own types and nothing else", () => {
    expect(isChangeEntityType("Rfi")).toBe(true);
    expect(isChangeEntityType("Comment")).toBe(false);
    expect(isChangeEntityType(undefined)).toBe(false);
  });
});

describe("recordNumber / formatRecordRef", () => {
  it("names a numbered record by its number, then its title", () => {
    const row = { id: 14, cvrNumber: "CVR-014", title: "Reroute line" };
    expect(recordNumber("ChangeLog", row)).toBe("CVR-014");
    expect(formatRecordRef("ChangeLog", row)).toBe("CVR-014 — Reroute line");
  });

  it("falls back to the noun and id until a number is allocated — the same way everywhere", () => {
    expect(recordNumber("Pco", { id: 3, pcoNumber: "" })).toBe("PCO #3");
    expect(recordNumber("Trend", { id: 9, trendNumber: null })).toBe(
      "Trend #9",
    );
    expect(
      formatRecordRef("Pco", { id: 3, pcoNumber: null, title: "Scope" }),
    ).toBe("PCO #3 — Scope");
  });

  it("reads the RFI's subject as its title, and takes a title handed in over the row's", () => {
    const rfi = { id: 21, rfiNumber: "RFI-021", subject: "Anchor bolts" };
    expect(formatRecordRef("Rfi", rfi)).toBe("RFI-021 — Anchor bolts");
    expect(formatRecordRef("Rfi", rfi, "Other")).toBe("RFI-021 — Other");
  });

  it("is just the number when there is no title to add", () => {
    expect(formatRecordRef("Rfi", { id: 21, rfiNumber: "RFI-021" })).toBe(
      "RFI-021",
    );
    expect(formatRecordRef("Rfi", { id: 21, rfiNumber: "RFI-021" }, "")).toBe(
      "RFI-021",
    );
  });
});

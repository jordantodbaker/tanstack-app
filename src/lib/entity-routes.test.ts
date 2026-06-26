import { describe, expect, it } from "vitest";
import { ENTITY_LIST_PATH, entityListPath } from "./entity-routes";

// Shared by the NotificationBell (click → navigate) and email deep links.
// A wrong/missing mapping means a notification points nowhere.
describe("entityListPath", () => {
  it("maps every record entityType to its list route", () => {
    expect(entityListPath("ChangeLog")).toBe("/changelog");
    expect(entityListPath("FieldChangeOrder")).toBe("/fco-log");
    expect(entityListPath("Rfi")).toBe("/rfis");
    expect(entityListPath("Trend")).toBe("/trends");
    expect(entityListPath("Pco")).toBe("/pco");
  });

  it("returns undefined for types without a list page", () => {
    expect(entityListPath("Comment")).toBeUndefined();
    expect(entityListPath("Attachment")).toBeUndefined();
    expect(entityListPath("")).toBeUndefined();
  });

  it("covers exactly the five numbered entity types", () => {
    expect(Object.keys(ENTITY_LIST_PATH).sort()).toEqual([
      "ChangeLog",
      "FieldChangeOrder",
      "Pco",
      "Rfi",
      "Trend",
    ]);
  });
});

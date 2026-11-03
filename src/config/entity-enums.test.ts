import { describe, expect, it } from "vitest";
import {
  CHANGE_STATUSES,
  CHANGE_TYPES,
  CVR_COST_TYPES,
  FCO_ORIGIN_TYPES,
  FCO_STATUSES,
  PCO_STATUSES,
  PRIORITIES,
  PRIORITY_LABELS,
  RFI_STATUSES,
  RISK_LEVELS,
  TREND_STATUSES,
} from "./entity-enums";
import {
  UpsertChangeLogSchema,
  UpsertFcoSchema,
  UpsertPcoSchema,
  UpsertRfiSchema,
  UpsertTrendSchema,
} from "~/lib/validators";

/**
 * One copy of each enum, read by the validators and the entity modules. The
 * schema side is checked here directly: every value the UI can offer must
 * parse, or the dialog offers a status the server refuses.
 */

describe("entity enums", () => {
  it("has no duplicate values in any list", () => {
    for (const list of [
      CHANGE_STATUSES,
      CHANGE_TYPES,
      RISK_LEVELS,
      CVR_COST_TYPES,
      FCO_STATUSES,
      FCO_ORIGIN_TYPES,
      RFI_STATUSES,
      TREND_STATUSES,
      PCO_STATUSES,
      PRIORITIES,
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("labels every priority", () => {
    expect(Object.keys(PRIORITY_LABELS).sort()).toEqual([...PRIORITIES].sort());
  });

  it("is what the validators accept, value for value", () => {
    const values = (schema: { shape: Record<string, unknown> }, key: string) =>
      (schema.shape[key] as { options: readonly string[] }).options;
    expect(values(UpsertChangeLogSchema, "status")).toEqual(CHANGE_STATUSES);
    expect(values(UpsertChangeLogSchema, "type")).toEqual(CHANGE_TYPES);
    expect(values(UpsertChangeLogSchema, "riskLevel")).toEqual(RISK_LEVELS);
    expect(values(UpsertFcoSchema, "status")).toEqual(FCO_STATUSES);
    expect(values(UpsertFcoSchema, "originType")).toEqual(FCO_ORIGIN_TYPES);
    for (const schema of [
      UpsertFcoSchema,
      UpsertRfiSchema,
      UpsertTrendSchema,
      UpsertPcoSchema,
    ]) {
      expect(values(schema, "priority")).toEqual(PRIORITIES);
    }
  });
});

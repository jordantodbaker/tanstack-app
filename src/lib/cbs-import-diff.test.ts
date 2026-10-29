import { describe, expect, it } from "vitest";
import { parseCbsDisplayCode } from "./cbs-tree";
import type { CbsDictionaryRow } from "./cbs-dictionary";
import {
  CBS_IMPORT_FIELDS,
  cbsBulkUpdateSql,
  changedCbsFields,
  type StoredCbsRow,
} from "./cbs-import-diff";

function row(over: Partial<CbsDictionaryRow> = {}): CbsDictionaryRow {
  const displayCode = "601-05-0000-00-0";
  return {
    ...parseCbsDisplayCode(displayCode),
    name: "Fab",
    displayCode,
    uom: "LS",
    // Where the row sits in the workbook; traced through, never keyed on.
    originalRow: null,
    expandedRow: null,
    isOriginal: null,
    subReporting: false,
    materialCode: true,
    laborCode: true,
    equipmentCode: false,
    otherCode: null,
    rentalCode: null,
    materialType: "Bulks",
    costCenter: "2010",
    costClassification: "DIRECT",
    status: "Active",
    accountDescription: "Fab",
    l2Description: null,
    core: null,
    coreExtension: null,
    wbs: null,
    p6CostAccount: null,
    gl: null,
    discipline: "Piping",
    costCode: "601050000000",
    description: "Summary of Fab.",
    notes: null,
    displayDescription: "601-05-0000-00-0:  Fab",
    ...over,
  };
}

/** A stored copy of `r` as the import reads it back. */
function stored(
  r: CbsDictionaryRow,
  over: Partial<StoredCbsRow> = {},
): StoredCbsRow {
  return { ...r, ...over };
}

describe("CBS_IMPORT_FIELDS", () => {
  it("covers every CbsDictionaryRow column except the costCode key", () => {
    const keys = Object.keys(row())
      .filter((k) => k !== "costCode")
      .sort();
    expect([...CBS_IMPORT_FIELDS].sort()).toEqual(keys);
  });
});

describe("changedCbsFields", () => {
  it("returns null when the stored row matches the loaded row", () => {
    const r = row();
    expect(changedCbsFields(stored(r), r)).toBeNull();
  });

  it("returns only the columns that differ", () => {
    const r = row();
    const diff = changedCbsFields(
      stored(r, { name: "Old name", gl: "5100" }),
      r,
    );
    expect(diff).toEqual({ name: "Fab", gl: null });
  });

  it("treats null and empty string as different values", () => {
    const r = row({ notes: "" });
    expect(changedCbsFields(stored(r, { notes: null }), r)).toEqual({
      notes: "",
    });
  });

  it("treats a null flag and false as different values", () => {
    const r = row({ subReporting: false });
    expect(changedCbsFields(stored(r, { subReporting: null }), r)).toEqual({
      subReporting: false,
    });
  });

  it("ignores the costCode key itself", () => {
    const r = row();
    expect(
      changedCbsFields(stored(r, { costCode: "different" }), r),
    ).toBeNull();
  });
});

describe("cbsBulkUpdateSql", () => {
  const sql = cbsBulkUpdateSql();

  it("writes every import field, keyed on costCode", () => {
    for (const f of CBS_IMPORT_FIELDS) {
      expect(sql).toContain(`v."${f}"`);
    }
    expect(sql).toContain(`WHERE c."costCode" = v."costCode"`);
    // The key is matched on, never rewritten.
    expect(sql).not.toMatch(/"costCode" = v\."costCode",/);
  });

  it("writes Original Row into its mapped column", () => {
    // The schema keeps the database column as masterCbsRow; a column named
    // after the field would not exist and fail the whole batch.
    expect(sql).toContain(`"masterCbsRow" = v."originalRow"`);
    expect(sql).not.toContain(`"originalRow" = `);
  });

  it("writes the Original Row flag as a boolean", () => {
    // Read from the JSON as a boolean, so TRUE / FALSE land as such.
    expect(sql).toContain(`"isOriginal" = v."isOriginal"`);
    expect(sql).toMatch(/"isOriginal" boolean/);
  });
});

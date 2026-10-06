import { describe, expect, it } from "vitest";
import { parseCbsDisplayCode } from "./cbs-tree";
import type { MasterCbsItem } from "./cbs-dictionary";
import {
  CBS_IMPORT_FIELDS,
  changedCbsFields,
  type StoredCbsRow,
} from "./cbs-import-diff";

function row(over: Partial<MasterCbsItem> = {}): MasterCbsItem {
  const displayCode = "601-05-0000-00-0";
  return {
    ...parseCbsDisplayCode(displayCode),
    name: "Fab",
    displayCode,
    uom: "LS",
    subReporting: false,
    materialCode: true,
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
    rowType: "ORIGINAL",
    generatedFrom: null,
    ...over,
  };
}

/** A stored copy of `r` as the import reads it back. */
function stored(r: MasterCbsItem, over: Partial<StoredCbsRow> = {}): StoredCbsRow {
  return { ...r, ...over };
}

describe("CBS_IMPORT_FIELDS", () => {
  it("covers every MasterCbsItem column except the costCode key", () => {
    const keys = Object.keys(row()).filter((k) => k !== "costCode").sort();
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
    expect(changedCbsFields(stored(r, { notes: null }), r)).toEqual({ notes: "" });
  });

  it("treats a null flag and false as different values", () => {
    const r = row({ subReporting: false });
    expect(changedCbsFields(stored(r, { subReporting: null }), r)).toEqual({
      subReporting: false,
    });
  });

  it("ignores the costCode key itself", () => {
    const r = row();
    expect(changedCbsFields(stored(r, { costCode: "different" }), r)).toBeNull();
  });
});

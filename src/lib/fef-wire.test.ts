import { describe, expect, it } from "vitest";
import { makeFefRow, FEF_ROW_STRING_FIELDS } from "./fef-helpers";
import { compactFefRow, expandFefRow } from "./fef-wire";

/**
 * The sparse wire form of a take-off row: blanks dropped on the way out,
 * put back on the way in, and nothing lost in between.
 */
describe("fef-wire", () => {
  it("keeps only the id and the fields that hold something", () => {
    const row = makeFefRow({
      id: "601-10-0000-00-L",
      name: "Pipe",
      quantity: "4",
    });
    expect(compactFefRow(row)).toEqual({
      id: "601-10-0000-00-L",
      name: "Pipe",
      quantity: "4",
    });
  });

  it("round-trips every field, blank ids included", () => {
    const row = makeFefRow({ id: "__fe-blank-3", notes: "x", laborRate: "0" });
    expect(expandFefRow(compactFefRow(row))).toEqual(row);
    // Every field is back, as "", not undefined.
    const blank = expandFefRow({ id: "__fe-blank-9" });
    for (const f of FEF_ROW_STRING_FIELDS) expect(blank[f]).toBe("");
  });

  it("accepts a full row as well as a sparse one", () => {
    const row = makeFefRow({ id: "A", description: "d" });
    expect(expandFefRow(row)).toEqual(row);
  });

  it("is a fraction of the full row on an empty-ish sheet", () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      makeFefRow({ id: `__fe-blank-${i}`, quantity: i % 10 === 0 ? "1" : "" }),
    );
    const full = JSON.stringify(rows).length;
    const sparse = JSON.stringify(rows.map(compactFefRow)).length;
    expect(sparse).toBeLessThan(full / 5);
  });
});

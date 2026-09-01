import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import { CbsNameCell, ReadOnlyCell } from "~/lib/table-utils";
import { takeOffColumns, fieldEstimateColumns } from "./columns";

/**
 * Which piping columns an estimator may type into.
 *
 * The piping take-off derives more than any other sheet: the CBS item comes
 * from Weld Group + Shop/Field + Size + Fabricate/Erect, Labor Hours from the
 * task code's factor curve, Labor Rate from the role/schedule rate book. A
 * derived column that still accepts input is worse than one that refuses:
 * the typed value survives until the next edit to one of its inputs, then
 * vanishes without explanation.
 */

const cellOf = (cols: ColumnDef<FefRow, string>[], id: string) => {
  const col = cols.find(
    (c) => (c as { accessorKey?: string; id?: string }).accessorKey === id ||
      (c as { id?: string }).id === id,
  );
  expect(col, `no "${id}" column`).toBeDefined();
  return (col as { cell?: unknown }).cell;
};

describe("piping take-off columns", () => {
  it("renders Name read-only — it is stamped, not chosen", () => {
    // It used to be a CBS dropdown, which let someone select an item the other
    // four columns contradicted; the next edit to any of them re-stamped it.
    expect(cellOf(takeOffColumns, "name")).toBe(CbsNameCell);
  });

  it("renders the other derived outputs read-only too", () => {
    expect(cellOf(takeOffColumns, "unit")).toBe(ReadOnlyCell);
    expect(cellOf(takeOffColumns, "laborRate")).toBe(ReadOnlyCell);
  });

  it("keeps Name read-only on the Field Estimate view as well", () => {
    expect(cellOf(fieldEstimateColumns, "name")).toBe(CbsNameCell);
  });

  it("still lets the estimator drive the columns Name is derived FROM", () => {
    // Removing the Name picker is only acceptable because these remain
    // editable — they are the whole input surface for the CBS stamp.
    for (const id of ["weldGroupDescription", "shopField", "fabricateErect", "size"]) {
      const cell = cellOf(takeOffColumns, id);
      expect(cell, `${id} should stay editable`).not.toBe(ReadOnlyCell);
      expect(cell, `${id} should stay editable`).not.toBe(CbsNameCell);
    }
  });
});

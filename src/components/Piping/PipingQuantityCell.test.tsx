// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { makeFefRow } from "~/lib/fef-helpers";
import type { CellProps } from "~/lib/fef-cells";
import { PipingQuantityCell } from "./cells";

/**
 * The piping cells derive their write from the row they sit on. They used to
 * find that row with `table.getRowModel().rows[row.index]`, but the row model
 * is the rows after filtering, sorting and paging — the grid pages at 25 on
 * the client — while `row.index` is the position in the full data. On page
 * two the lookup was undefined and the edit threw; under a sort or the
 * "Errors only" filter it silently read another row's values. `row.original`
 * is the row itself, whatever the model holds.
 */

afterEach(cleanup);

const lookup = new Map([
  ["WLD-CS-SCH40", { unit: "EA", values: new Map([[4, 0.5]]) }],
]);

/** Renders the cell for a row at `index` in the data, with an EMPTY page. */
function renderCell(index: number) {
  const updateRow = vi.fn();
  const original = makeFefRow({
    id: "row-31",
    taskCode: "WLD-CS-SCH40",
    size: "4",
    quantity: "2",
  });
  const table = {
    options: { meta: { pipingFactorLookup: lookup, updateRow } },
    getRowModel: () => ({ rows: [] }),
  } as unknown as CellProps["table"];
  render(
    <PipingQuantityCell
      getValue={() => original.quantity}
      row={{ index, original }}
      column={{ id: "quantity" }}
      table={table}
    />,
  );
  return updateRow;
}

describe("PipingQuantityCell", () => {
  it("derives from the row it was given, not from the paged row model", () => {
    const updateRow = renderCell(30);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // 0.5 h per unit at size 4 × 6 units, written back at the data index.
    expect(updateRow).toHaveBeenCalledWith(30, {
      quantity: "6",
      laborHours: "3.0",
    });
  });
});

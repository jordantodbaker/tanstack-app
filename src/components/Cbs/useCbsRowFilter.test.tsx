// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  CBS_FILTER_NONE,
  parseCbsDisplayCode,
  type CbsTreeItem,
} from "~/lib/cbs-tree";
import { useCbsRowFilter } from "./useCbsRowFilter";

let nextId = 1;
const item = (
  displayCode: string,
  over: Partial<CbsTreeItem> = {},
): CbsTreeItem => ({
  id: nextId++,
  ...parseCbsDisplayCode(displayCode),
  displayCode,
  name: "",
  accountDescription: "",
  uom: "",
  ...over,
});

const ITEMS = [
  item("601-00-0000-00-0", {
    discipline: "Piping",
    costClassification: "INDIRECT",
  }),
  item("601-00-0000-00-M", {
    discipline: "Piping",
    costClassification: "MATERIALS",
    materialType: "Bulks",
  }),
  item("601-00-0000-00-L", {
    discipline: "Piping",
    costClassification: "MATERIALS",
    materialType: "Bulks",
  }),
];

describe("useCbsRowFilter", () => {
  it("starts with nothing filtered", () => {
    const { result } = renderHook(() => useCbsRowFilter({ items: ITEMS }));
    expect(result.current.filter).toEqual(CBS_FILTER_NONE);
    expect(result.current.filtering).toBe(false);
  });

  it("counts each picker's options from the rows, judging only the rows it applies to", () => {
    const { result } = renderHook(() => useCbsRowFilter({ items: ITEMS }));
    expect(result.current.controls.valueOptions).toEqual({
      disciplines: [{ value: "Piping", count: 3 }],
      classifications: [
        { value: "INDIRECT", count: 1 },
        { value: "MATERIALS", count: 2 },
      ],
      // The Labor line carries "Bulks" too, but is not a Materials line.
      materialTypes: [{ value: "Bulks", count: 1 }],
    });
  });

  it("hands out only the controls the page offers", () => {
    const bare = renderHook(() => useCbsRowFilter({ items: ITEMS })).result
      .current.controls;
    expect(bare.onToggleCostType).toBeDefined();
    expect(bare.onValueChange).toBeDefined();
    expect(bare.onToggleStatus).toBeUndefined();
    expect(bare.onRowTypeChange).toBeUndefined();

    const full = renderHook(() =>
      useCbsRowFilter({
        items: ITEMS,
        statusFilter: true,
        rowTypeFilter: true,
      }),
    ).result.current.controls;
    expect(full.onToggleStatus).toBeDefined();
    expect(full.onRowTypeChange).toBeDefined();
  });

  it("trims and case-folds the search into the filter", () => {
    const { result } = renderHook(() => useCbsRowFilter({ items: ITEMS }));
    act(() => result.current.controls.onQueryChange("  Pipe RACK "));
    expect(result.current.controls.query).toBe("  Pipe RACK ");
    expect(result.current.filter.query).toBe("pipe rack");
    expect(result.current.filtering).toBe(true);
  });

  it("folds every toggle and pick into one filter", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({
        items: ITEMS,
        statusFilter: true,
        rowTypeFilter: true,
      }),
    );
    act(() => result.current.controls.onToggleCostType!("labor"));
    act(() => result.current.controls.onToggleStatus!("retired"));
    act(() => result.current.controls.onRowTypeChange!("generated"));
    act(() =>
      result.current.controls.onValueChange!("classifications", ["MATERIALS"]),
    );
    act(() =>
      result.current.controls.onValueChange!("disciplines", ["Piping"]),
    );
    expect(result.current.filter).toEqual({
      ...CBS_FILTER_NONE,
      labor: true,
      retired: true,
      rowType: "generated",
      classifications: ["MATERIALS"],
      disciplines: ["Piping"],
    });

    act(() => result.current.controls.onToggleCostType!("labor"));
    expect(result.current.filter.labor).toBe(false);
    act(() => result.current.controls.onValueChange!("disciplines", []));
    expect(result.current.filter.disciplines).toEqual([]);
  });

  it("resets a picker that belongs to a cost type each time that type is pressed", () => {
    const { result } = renderHook(() => useCbsRowFilter({ items: ITEMS }));
    act(() => result.current.controls.onToggleCostType!("material"));
    act(() =>
      result.current.controls.onValueChange!("materialTypes", ["Bulks"]),
    );
    expect(result.current.filter.materialTypes).toEqual(["Bulks"]);

    // Off: the pick is still held, but no longer in force.
    act(() => result.current.controls.onToggleCostType!("material"));
    expect(result.current.filtering).toBe(false);
    // On again: starts from all material types, not the old pick.
    act(() => result.current.controls.onToggleCostType!("material"));
    expect(result.current.filter.materialTypes).toEqual([]);
    // Pressing another type leaves it alone.
    act(() =>
      result.current.controls.onValueChange!("materialTypes", ["Bulks"]),
    );
    act(() => result.current.controls.onToggleCostType!("labor"));
    expect(result.current.filter.materialTypes).toEqual(["Bulks"]);
  });

  it("filters on the search text once a deferred search catches up", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({ items: ITEMS, deferQuery: true }),
    );
    act(() => result.current.controls.onQueryChange("weld"));
    expect(result.current.filter.query).toBe("weld");
    expect(result.current.searchPending).toBe(false);
  });
});

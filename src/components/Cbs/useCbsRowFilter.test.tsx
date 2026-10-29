// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CBS_FILTER_NONE } from "~/lib/cbs-tree";
import { useCbsRowFilter } from "./useCbsRowFilter";

const OPTIONS = [{ value: "MATERIALS", count: 3 }];
const MATERIAL_TYPES = [{ value: "Bulks", count: 2 }];

describe("useCbsRowFilter", () => {
  it("starts with nothing filtered", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({ classificationOptions: OPTIONS }),
    );
    expect(result.current.filter).toEqual(CBS_FILTER_NONE);
    expect(result.current.filtering).toBe(false);
    expect(result.current.controls.classificationOptions).toBe(OPTIONS);
  });

  it("hands out only the controls the page offers", () => {
    const bare = renderHook(() =>
      useCbsRowFilter({ classificationOptions: OPTIONS }),
    ).result.current.controls;
    expect(bare.onToggleCostType).toBeDefined();
    expect(bare.onClassificationsChange).toBeDefined();
    expect(bare.onToggleStatus).toBeUndefined();
    expect(bare.onRowTypeChange).toBeUndefined();
    expect(bare.onMaterialTypesChange).toBeUndefined();

    const full = renderHook(() =>
      useCbsRowFilter({
        classificationOptions: OPTIONS,
        statusFilter: true,
        rowTypeFilter: true,
      }),
    ).result.current.controls;
    expect(full.onToggleStatus).toBeDefined();
    expect(full.onRowTypeChange).toBeDefined();
  });

  it("trims and case-folds the search into the filter", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({ classificationOptions: OPTIONS }),
    );
    act(() => result.current.controls.onQueryChange("  Pipe RACK "));
    expect(result.current.controls.query).toBe("  Pipe RACK ");
    expect(result.current.filter.query).toBe("pipe rack");
    expect(result.current.filtering).toBe(true);
  });

  it("folds every toggle into one filter", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({
        classificationOptions: OPTIONS,
        statusFilter: true,
        rowTypeFilter: true,
      }),
    );
    act(() => result.current.controls.onToggleCostType!("labor"));
    act(() => result.current.controls.onToggleStatus!("retired"));
    act(() => result.current.controls.onRowTypeChange!("generated"));
    act(() => result.current.controls.onClassificationsChange!(["MATERIALS"]));
    expect(result.current.filter).toEqual({
      ...CBS_FILTER_NONE,
      labor: true,
      retired: true,
      rowType: "generated",
      classifications: ["MATERIALS"],
    });

    act(() => result.current.controls.onToggleCostType!("labor"));
    expect(result.current.filter.labor).toBe(false);
  });

  it("shows the Material Type picker only while Materials is on, and resets it", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({
        classificationOptions: OPTIONS,
        materialTypeOptions: MATERIAL_TYPES,
      }),
    );
    expect(result.current.controls.onMaterialTypesChange).toBeUndefined();

    act(() => result.current.controls.onToggleCostType!("material"));
    act(() => result.current.controls.onMaterialTypesChange!(["Bulks"]));
    expect(result.current.filter.materialTypes).toEqual(["Bulks"]);

    // Off and on again: the old pick does not come back.
    act(() => result.current.controls.onToggleCostType!("material"));
    expect(result.current.controls.onMaterialTypesChange).toBeUndefined();
    act(() => result.current.controls.onToggleCostType!("material"));
    expect(result.current.filter.materialTypes).toEqual([]);
  });

  it("filters on the search text once a deferred search catches up", () => {
    const { result } = renderHook(() =>
      useCbsRowFilter({ classificationOptions: OPTIONS, deferQuery: true }),
    );
    act(() => result.current.controls.onQueryChange("weld"));
    expect(result.current.filter.query).toBe("weld");
    expect(result.current.searchPending).toBe(false);
  });
});

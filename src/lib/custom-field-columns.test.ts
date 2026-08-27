import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "./types";
import {
  CUSTOM_FIELD_COLUMN_WIDTH,
  buildCustomFieldColumns,
  customFieldColumnGroup,
  withCustomFieldColumns,
} from "./custom-field-columns";

/**
 * The property that matters here is the column `id`.
 *
 * Saved widths, column visibility and the range-selection machinery are all
 * keyed by column id. If the id were derived from the label, renaming a column
 * would read as a brand-new column to all three — the estimator's saved width
 * would vanish and any active selection would point at nothing.
 */

const col = (c: ColumnDef<FefRow, string>) =>
  c as { id?: string; header?: unknown; size?: number; meta?: unknown };

const stub = (id: string): ColumnDef<FefRow, string> =>
  ({ id, header: id }) as ColumnDef<FefRow, string>;

describe("buildCustomFieldColumns", () => {
  it("uses the slot field as the column id and the label as the header", () => {
    const [c] = buildCustomFieldColumns([
      { field: "custom3", label: "Client Tag" },
    ]);
    expect(col(c).id).toBe("custom3");
    // No definition id, so nothing to act on — a plain label.
    expect(col(c).header).toBe("Client Tag");
  });

  it("renders an interactive header when given a definition id", () => {
    // With an id the header becomes the ⋯ menu component, so a column can be
    // renamed or removed from where it is rather than only from the popover.
    const [c] = buildCustomFieldColumns([
      { field: "custom3", label: "Client Tag", id: 7 },
    ]);
    expect(typeof col(c).header).toBe("function");
  });

  it("keeps the plain label reachable once the header is a component", () => {
    // `header` can no longer be read as text, so exports and any future column
    // picker take the label from meta instead.
    const [withId] = buildCustomFieldColumns([
      { field: "custom3", label: "Client Tag", id: 7 },
    ]);
    const [withoutId] = buildCustomFieldColumns([
      { field: "custom3", label: "Client Tag" },
    ]);
    expect(col(withId).meta).toEqual({ label: "Client Tag" });
    expect(col(withoutId).meta).toEqual({ label: "Client Tag" });
  });

  it("keeps the id stable across a rename", () => {
    const before = buildCustomFieldColumns([
      { field: "custom3", label: "Client Tag" },
    ]);
    const after = buildCustomFieldColumns([
      { field: "custom3", label: "Client Tag Rev B" },
    ]);
    expect(col(before[0]).id).toBe(col(after[0]).id);
    expect(col(after[0]).header).toBe("Client Tag Rev B");
  });

  it("gives every custom column the same default width", () => {
    const cols = buildCustomFieldColumns([
      { field: "custom1", label: "A" },
      { field: "custom2", label: "B" },
    ]);
    for (const c of cols) expect(col(c).size).toBe(CUSTOM_FIELD_COLUMN_WIDTH);
  });

  it("preserves the order it was given", () => {
    const cols = buildCustomFieldColumns([
      { field: "custom5", label: "Third" },
      { field: "custom1", label: "First" },
    ]);
    expect(cols.map((c) => col(c).id)).toEqual(["custom5", "custom1"]);
  });

  it("skips a definition whose slot resolved to no field", () => {
    // An out-of-range slot has no storage column. Rendering it would give the
    // estimator cells that silently discard whatever they type.
    const cols = buildCustomFieldColumns([
      { field: "", label: "Orphaned" },
      { field: "custom2", label: "Real" },
    ]);
    expect(cols).toHaveLength(1);
    expect(col(cols[0]).id).toBe("custom2");
  });

  it("returns nothing for no definitions", () => {
    expect(buildCustomFieldColumns([])).toEqual([]);
  });
});

describe("withCustomFieldColumns", () => {
  const base = [stub("name"), stub("description"), stub("quantity")];

  it("appends custom columns after the fixed ones", () => {
    const out = withCustomFieldColumns(base, [
      { field: "custom1", label: "Client Tag" },
    ]);
    expect(out.map((c) => col(c).id)).toEqual([
      "name",
      "description",
      "quantity",
      "custom1",
    ]);
  });

  it("returns the base array untouched when there are no definitions", () => {
    // Identity, not a copy — every sheet without custom columns should keep the
    // stable array reference the grid memoizes on.
    expect(withCustomFieldColumns(base, [])).toBe(base);
  });

  it("does not mutate the base array", () => {
    withCustomFieldColumns(base, [{ field: "custom1", label: "X" }]);
    expect(base).toHaveLength(3);
  });

  it("keeps fixed column order intact", () => {
    const out = withCustomFieldColumns(base, [
      { field: "custom2", label: "B" },
      { field: "custom1", label: "A" },
    ]);
    expect(out.slice(0, 3).map((c) => col(c).id)).toEqual([
      "name",
      "description",
      "quantity",
    ]);
    expect(out.slice(3).map((c) => col(c).id)).toEqual(["custom2", "custom1"]);
  });
});

describe("customFieldColumnGroup", () => {
  it("collects every custom column into one chip-only group", () => {
    const g = customFieldColumnGroup([
      { field: "custom1", label: "Client Tag" },
      { field: "custom4", label: "Heat Number" },
    ]);
    expect(g).toEqual({
      label: "Custom",
      columnIds: ["custom1", "custom4"],
      banner: false,
    });
  });

  it("is null when the discipline has no custom columns", () => {
    // So the chip row shows nothing rather than an empty toggle.
    expect(customFieldColumnGroup([])).toBeNull();
  });

  it("ignores a definition with no storage field", () => {
    const g = customFieldColumnGroup([
      { field: "", label: "Orphaned" },
      { field: "custom2", label: "Real" },
    ]);
    expect(g?.columnIds).toEqual(["custom2"]);
  });

  it("is null when every definition is unusable", () => {
    expect(customFieldColumnGroup([{ field: "", label: "Orphaned" }])).toBeNull();
  });

  it("names ids that match the columns it builds", () => {
    // The group toggles visibility BY column id — a mismatch would make the
    // chip silently toggle nothing.
    const specs = [{ field: "custom3", label: "Client Tag" }];
    const ids = buildCustomFieldColumns(specs).map(
      (c) => (c as { id?: string }).id,
    );
    expect(customFieldColumnGroup(specs)?.columnIds).toEqual(ids);
  });
});

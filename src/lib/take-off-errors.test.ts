import { describe, it, expect } from "vitest";
import { makeFefRow } from "./fef-helpers";
import {
  countInvalidRows,
  invalidRowIndices,
  isRowInErrorFilter,
} from "./take-off-errors";

/** A row the user has started (has a name) but which can't price. */
const broken = (over = {}) =>
  makeFefRow({ name: "Install pipe", quantity: "10", ...over });

/** A row that prices cleanly. */
const priced = (over = {}) =>
  makeFefRow({
    name: "Install pipe",
    quantity: "10",
    laborHours: "10",
    laborRate: "150",
    ...over,
  });

/** An untouched template row — not an error, just empty. */
const blank = () => makeFefRow();

describe("invalidRowIndices", () => {
  it("indexes the rows in error, not the valid or blank ones", () => {
    const rows = [priced(), broken(), blank(), broken(), priced()];
    expect(invalidRowIndices(rows)).toEqual(new Set([1, 3]));
  });

  it("ignores untouched blank rows entirely", () => {
    expect(invalidRowIndices([blank(), blank(), blank()])).toEqual(new Set());
  });

  it("counts a row missing only the rate", () => {
    expect(invalidRowIndices([broken({ laborHours: "10" })])).toEqual(
      new Set([0]),
    );
  });

  it("counts a row missing only the hours", () => {
    expect(invalidRowIndices([broken({ laborRate: "150" })])).toEqual(
      new Set([0]),
    );
  });

  it("treats a row touched in any field as started", () => {
    // Picking just a schedule is enough to mean "the user began this row".
    expect(invalidRowIndices([makeFefRow({ schedule: "ST" })])).toEqual(
      new Set([0]),
    );
  });

  it("returns an empty set for an empty sheet", () => {
    expect(invalidRowIndices([])).toEqual(new Set());
  });
});

describe("countInvalidRows", () => {
  it("agrees with invalidRowIndices", () => {
    const rows = [priced(), broken(), blank(), broken(), broken()];
    expect(countInvalidRows(rows)).toBe(invalidRowIndices(rows).size);
    expect(countInvalidRows(rows)).toBe(3);
  });

  it("is zero for a clean sheet", () => {
    expect(countInvalidRows([priced(), priced(), blank()])).toBe(0);
  });
});

describe("isRowInErrorFilter", () => {
  const pinned = new Set([1, 3]);

  it("keeps a pinned row after it has been fixed", () => {
    // The point of pinning: fixing a row must not yank it out from under the
    // cursor mid-edit.
    expect(isRowInErrorFilter(priced(), 1, pinned)).toBe(true);
  });

  it("keeps a pinned row that is still broken", () => {
    expect(isRowInErrorFilter(broken(), 3, pinned)).toBe(true);
  });

  it("hides a valid row that was never pinned", () => {
    expect(isRowInErrorFilter(priced(), 0, pinned)).toBe(false);
  });

  it("hides an untouched blank row", () => {
    expect(isRowInErrorFilter(blank(), 7, pinned)).toBe(false);
  });

  it("adds a row that falls into error while the filter is on", () => {
    expect(isRowInErrorFilter(broken(), 9, pinned)).toBe(true);
  });

  it("shows everything in error when nothing is pinned", () => {
    const empty = new Set<number>();
    expect(isRowInErrorFilter(broken(), 0, empty)).toBe(true);
    expect(isRowInErrorFilter(priced(), 0, empty)).toBe(false);
  });

  it("selects exactly the pinned rows on the sheet they were captured from", () => {
    const rows = [priced(), broken(), blank(), broken(), priced()];
    const snapshot = invalidRowIndices(rows);
    const kept = rows.filter((row, i) => isRowInErrorFilter(row, i, snapshot));
    expect(kept).toHaveLength(2);
  });
});

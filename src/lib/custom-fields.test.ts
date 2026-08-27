import { describe, expect, it } from "vitest";
import {
  CUSTOM_FIELD_LABEL_MAX,
  assignPositions,
  moveInOrder,
  nextFreeSlot,
  nextPosition,
  normalizeLabel,
} from "./custom-fields";

describe("nextFreeSlot", () => {
  it("starts at 1 for a discipline with no columns", () => {
    expect(nextFreeSlot([])).toBe(1);
  });

  it("takes the next slot up when they are contiguous", () => {
    expect(nextFreeSlot([1, 2, 3])).toBe(4);
  });

  it("reuses a gap left by a removed column", () => {
    // Lowest-free, not next-highest: with only ten slots, a monotonic counter
    // would run out after ten lifetime columns instead of ten concurrent ones.
    expect(nextFreeSlot([1, 3, 4])).toBe(2);
  });

  it("does not care what order the used slots arrive in", () => {
    expect(nextFreeSlot([4, 1, 3])).toBe(2);
  });

  it("is undefined when every slot is taken", () => {
    expect(nextFreeSlot([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeUndefined();
  });

  it("respects a smaller slot count", () => {
    expect(nextFreeSlot([1, 2], 2)).toBeUndefined();
    expect(nextFreeSlot([1], 2)).toBe(2);
  });

  it("ignores duplicates in the used set", () => {
    expect(nextFreeSlot([1, 1, 2])).toBe(3);
  });
});

describe("nextPosition", () => {
  it("starts at 0", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("goes after the last column", () => {
    expect(nextPosition([0, 1, 2])).toBe(3);
  });

  it("goes after the highest, not the count", () => {
    // Positions can be sparse after a removal.
    expect(nextPosition([0, 5])).toBe(6);
  });
});

describe("normalizeLabel", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeLabel("  Client Tag  ")).toBe("Client Tag");
  });

  it("collapses internal whitespace — a header is one line", () => {
    expect(normalizeLabel("Client\n\tTag")).toBe("Client Tag");
    expect(normalizeLabel("Heat    Number")).toBe("Heat Number");
  });

  it("rejects a label with nothing in it", () => {
    expect(normalizeLabel("")).toBeNull();
    expect(normalizeLabel("   ")).toBeNull();
    expect(normalizeLabel("\n\t")).toBeNull();
  });

  it("caps an over-long label rather than rejecting it", () => {
    const out = normalizeLabel("x".repeat(200));
    expect(out).toHaveLength(CUSTOM_FIELD_LABEL_MAX);
  });

  it("leaves ordinary punctuation alone", () => {
    expect(normalizeLabel('Client Tag (P&ID)')).toBe("Client Tag (P&ID)");
  });
});

describe("assignPositions", () => {
  it("renumbers to contiguous positions in the given order", () => {
    expect(assignPositions([7, 3, 5], [3, 5, 7])).toEqual([
      { id: 7, position: 0 },
      { id: 3, position: 1 },
      { id: 5, position: 2 },
    ]);
  });

  it("drops an id that is no longer a definition", () => {
    // The ordered list comes from a drag; a column removed in another tab
    // between drag and drop must not be resurrected.
    expect(assignPositions([7, 99, 3], [3, 7])).toEqual([
      { id: 7, position: 0 },
      { id: 3, position: 1 },
    ]);
  });

  it("ignores a known id the client forgot to send", () => {
    // Missing ids simply keep whatever position they had — this returns only
    // what to write.
    expect(assignPositions([3], [3, 7])).toEqual([{ id: 3, position: 0 }]);
  });

  it("handles an empty order", () => {
    expect(assignPositions([], [3, 7])).toEqual([]);
  });
});

describe("moveInOrder", () => {
  it("moves an id one step earlier", () => {
    expect(moveInOrder([1, 2, 3], 3, -1)).toEqual([1, 3, 2]);
  });

  it("moves an id one step later", () => {
    expect(moveInOrder([1, 2, 3], 1, 1)).toEqual([2, 1, 3]);
  });

  it("clamps at the start", () => {
    expect(moveInOrder([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
  });

  it("clamps at the end", () => {
    expect(moveInOrder([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });

  it("leaves the order alone for an id that isn't there", () => {
    expect(moveInOrder([1, 2, 3], 99, 1)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input", () => {
    const ids = [1, 2, 3];
    moveInOrder(ids, 1, 1);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("handles a single-item list", () => {
    expect(moveInOrder([1], 1, -1)).toEqual([1]);
    expect(moveInOrder([1], 1, 1)).toEqual([1]);
  });
});

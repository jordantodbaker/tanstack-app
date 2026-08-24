// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { __columnWidthStorage } from "./table-utils";

const { read, write, MIN, MAX, PREFIX } = __columnWidthStorage;

describe("stored column widths", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips widths under a per-sheet key", () => {
    write("takeoff:piping", { size: 120, name: 300 });
    expect(read("takeoff:piping")).toEqual({ size: 120, name: 300 });
    // A different sheet keeps its own widths.
    expect(read("takeoff:steel")).toEqual({});
  });

  it("is inert without a key", () => {
    write(undefined, { size: 120 });
    expect(window.localStorage.length).toBe(0);
    expect(read(undefined)).toEqual({});
  });

  it("re-clamps on read, so a stored width can't outlive the bounds", () => {
    window.localStorage.setItem(
      PREFIX + "s",
      JSON.stringify({ tiny: MIN - 40, huge: MAX + 500, ok: 200 }),
    );
    expect(read("s")).toEqual({ tiny: MIN, huge: MAX, ok: 200 });
  });

  it("falls back to defaults rather than throwing on a bad blob", () => {
    window.localStorage.setItem(PREFIX + "s", "{not json");
    expect(read("s")).toEqual({});
    window.localStorage.setItem(PREFIX + "s", JSON.stringify(["nope"]));
    expect(read("s")).toEqual({});
  });

  it("drops non-numeric entries instead of writing them into the table", () => {
    window.localStorage.setItem(
      PREFIX + "s",
      JSON.stringify({ good: 150, bad: "wide", worse: null, nan: Number.NaN }),
    );
    expect(read("s")).toEqual({ good: 150 });
  });
});

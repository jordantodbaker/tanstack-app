import { describe, expect, it } from "vitest";
import { diffFields } from "./audit.server";

describe("diffFields", () => {
  it("returns an empty array when no listed field changed", () => {
    expect(
      diffFields({ a: "1", b: "2" }, { a: "1", b: "2" }, ["a", "b"]),
    ).toEqual([]);
  });

  it("emits one entry per changed field", () => {
    expect(
      diffFields(
        { a: "1", b: "2", c: "3" },
        { a: "1", b: "20", c: "30" },
        ["a", "b", "c"],
      ),
    ).toEqual([
      { field: "b", oldValue: "2", newValue: "20" },
      { field: "c", oldValue: "3", newValue: "30" },
    ]);
  });

  it("ignores fields not in the list even when they differ", () => {
    expect(
      diffFields({ a: "1", secret: "x" }, { a: "1", secret: "y" }, ["a"]),
    ).toEqual([]);
  });

  it("treats empty string, null, and undefined as equivalent (no change)", () => {
    const probe = (
      a: string | null | undefined,
      b: string | null | undefined,
    ) => diffFields({ v: a }, { v: b }, ["v"]);
    expect(probe("", null)).toEqual([]);
    expect(probe(null, undefined)).toEqual([]);
    expect(probe(undefined, "")).toEqual([]);
  });

  it("records transitions between empty and a value, in both directions", () => {
    expect(diffFields({ a: "" }, { a: "x" }, ["a"])).toEqual([
      { field: "a", oldValue: null, newValue: "x" },
    ]);
    expect(diffFields({ a: "x" }, { a: "" }, ["a"])).toEqual([
      { field: "a", oldValue: "x", newValue: null },
    ]);
  });

  it("joins arrays and detects element changes", () => {
    const probe = (a: string[], b: string[]) =>
      diffFields({ tags: a }, { tags: b }, ["tags"]);
    expect(probe(["a", "b"], ["a", "c"])).toEqual([
      { field: "tags", oldValue: "a, b", newValue: "a, c" },
    ]);
    // Same elements → no change.
    expect(probe(["a", "b"], ["a", "b"])).toEqual([]);
    // Empty array normalizes to null.
    expect(probe([], ["a"])).toEqual([
      { field: "tags", oldValue: null, newValue: "a" },
    ]);
  });

  it("normalizes Dates to ISO strings and compares by instant", () => {
    const d1 = new Date("2026-01-01T00:00:00.000Z");
    const d2 = new Date("2026-02-01T00:00:00.000Z");
    expect(diffFields({ when: d1 }, { when: d2 }, ["when"])).toEqual([
      {
        field: "when",
        oldValue: "2026-01-01T00:00:00.000Z",
        newValue: "2026-02-01T00:00:00.000Z",
      },
    ]);
    // Equal instants from distinct Date objects → no change.
    expect(diffFields({ when: d1 }, { when: new Date(d1) }, ["when"])).toEqual(
      [],
    );
  });

  it("stringifies numbers and booleans", () => {
    expect(diffFields({ n: 1 }, { n: 2 }, ["n"])).toEqual([
      { field: "n", oldValue: "1", newValue: "2" },
    ]);
    expect(diffFields({ ok: false }, { ok: true }, ["ok"])).toEqual([
      { field: "ok", oldValue: "false", newValue: "true" },
    ]);
  });

  it("does not collapse boolean false to empty", () => {
    // `false` is a real value — it must not normalize to null, which would
    // make a false→false update look unchanged for the wrong reason, or a
    // genuinely-empty field look equal to `false`.
    expect(diffFields({ ok: false }, { ok: false }, ["ok"])).toEqual([]);
    const probe = (a: boolean, b: string | null) =>
      diffFields({ v: a as unknown as string }, { v: b as string }, ["v"]);
    expect(probe(false, null)).toEqual([
      { field: "v", oldValue: "false", newValue: null },
    ]);
  });

  it("preserves the order of the fields list in its output", () => {
    expect(
      diffFields(
        { a: "1", b: "1", c: "1" },
        { a: "2", b: "2", c: "2" },
        ["c", "a", "b"],
      ).map((change) => change.field),
    ).toEqual(["c", "a", "b"]);
  });
});

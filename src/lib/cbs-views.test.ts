import { describe, expect, it } from "vitest";
import { CBS_VIEWS, CBS_VIEW_KEYS } from "./cbs-views";

const ROWS = [
  { displayCode: "040-00-0000-00-0", status: "Inactive" },
  { displayCode: "044-50-0000-00-0", status: "Active" },
  { displayCode: "100-00-0000-00-0", status: "Retired" },
];
const listed = (view: (typeof CBS_VIEW_KEYS)[number]) =>
  CBS_VIEWS[view]
    .rows(ROWS)
    .map((r) => (r.context ? `(${r.displayCode})` : r.displayCode));

describe("CBS_VIEWS", () => {
  it("cost accounts: active rows, inactive parents as context", () => {
    expect(listed("accounts")).toEqual([
      "044-50-0000-00-0",
      "(040-00-0000-00-0)",
    ]);
  });

  it("works out cost accounts once per catalog", () => {
    expect(CBS_VIEWS.accounts.rows(ROWS)).toBe(CBS_VIEWS.accounts.rows(ROWS));
    expect(CBS_VIEWS.accounts.rows([...ROWS])).not.toBe(
      CBS_VIEWS.accounts.rows(ROWS),
    );
  });

  it("dictionary and project: every row they are given", () => {
    const all = ROWS.map((r) => r.displayCode);
    expect(listed("dictionary")).toEqual(all);
    expect(listed("project")).toEqual(all);
  });

  it("only the dictionary offers status, row type and legacy", () => {
    for (const key of CBS_VIEW_KEYS) {
      const { statusFilter, rowTypeFilter, legacyFilter } = CBS_VIEWS[key];
      const on = key === "dictionary";
      expect([statusFilter, rowTypeFilter, legacyFilter]).toEqual([on, on, on]);
    }
  });

  it("gives every export its own filename", () => {
    const names = CBS_VIEW_KEYS.map((k) => CBS_VIEWS[k].export.filename);
    expect(new Set(names).size).toBe(names.length);
  });
});

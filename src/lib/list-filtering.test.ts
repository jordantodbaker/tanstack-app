import { describe, expect, it } from "vitest";
import { matchesListFilters, type ListFilterAccessors } from "./list-filtering";

type Row = {
  status: string;
  discipline: string;
  number: string;
  title: string;
};

const ACC: ListFilterAccessors<Row> = {
  status: (r) => r.status,
  discipline: (r) => r.discipline,
  haystack: (r) => `${r.number} ${r.title}`,
};

const ROW: Row = {
  status: "OPEN",
  discipline: "piping",
  number: "CVR-001",
  title: "Extra pipe supports",
};

const NONE = { search: "", statusFilter: "", disciplineFilter: "" };

describe("matchesListFilters", () => {
  it("passes everything when no filters are set", () => {
    expect(matchesListFilters(ROW, NONE, ACC)).toBe(true);
  });

  it("keeps rows matching the status filter and drops the rest", () => {
    expect(matchesListFilters(ROW, { ...NONE, statusFilter: "OPEN" }, ACC)).toBe(
      true,
    );
    expect(
      matchesListFilters(ROW, { ...NONE, statusFilter: "CLOSED" }, ACC),
    ).toBe(false);
  });

  it("keeps rows matching the discipline filter and drops the rest", () => {
    expect(
      matchesListFilters(ROW, { ...NONE, disciplineFilter: "piping" }, ACC),
    ).toBe(true);
    expect(
      matchesListFilters(ROW, { ...NONE, disciplineFilter: "civil" }, ACC),
    ).toBe(false);
  });

  it("ignores the discipline filter when no discipline accessor is supplied", () => {
    const noDiscipline: ListFilterAccessors<Row> = {
      status: ACC.status,
      haystack: ACC.haystack,
    };
    // PCO-style: a discipline filter can't be set in the UI, but even if one
    // leaks in it must not exclude anything.
    expect(
      matchesListFilters(ROW, { ...NONE, disciplineFilter: "civil" }, noDiscipline),
    ).toBe(true);
  });

  it("matches the search term case-insensitively against the haystack", () => {
    expect(matchesListFilters(ROW, { ...NONE, search: "cvr-001" }, ACC)).toBe(
      true,
    );
    expect(matchesListFilters(ROW, { ...NONE, search: "PIPE" }, ACC)).toBe(true);
    expect(matchesListFilters(ROW, { ...NONE, search: "electrical" }, ACC)).toBe(
      false,
    );
  });

  it("trims surrounding whitespace from the search term", () => {
    expect(
      matchesListFilters(ROW, { ...NONE, search: "   supports  " }, ACC),
    ).toBe(true);
  });

  it("treats a whitespace-only search as no search", () => {
    expect(matchesListFilters(ROW, { ...NONE, search: "   " }, ACC)).toBe(true);
  });

  it("requires every active filter to pass (AND semantics)", () => {
    // Right status + discipline, but the search term doesn't match.
    expect(
      matchesListFilters(
        ROW,
        { search: "girder", statusFilter: "OPEN", disciplineFilter: "piping" },
        ACC,
      ),
    ).toBe(false);
    // All three align.
    expect(
      matchesListFilters(
        ROW,
        { search: "pipe", statusFilter: "OPEN", disciplineFilter: "piping" },
        ACC,
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { ChangeLogItem } from "./changelog";
import { rowsToCsv } from "~/lib/csv-export";
import { cvrCsvColumns } from "./changelogCsv";

// Minimal factory — every field carries a harmless default so each test
// overrides only what it cares about.
function cvr(partial: Partial<ChangeLogItem> = {}): ChangeLogItem {
  return {
    id: 1,
    projectId: 1,
    cvrNumber: "CVR-001",
    title: "Replace pump",
    description: "Detailed description.",
    status: "REQUESTED",
    type: "SCOPE",
    discipline: "piping",
    cbsCodes: ["600", "601"],
    originator: "alice@example.com",
    costImpact: 12500,
    scheduleDaysImpact: 3,
    laborHoursImpact: 40,
    riskLevel: "MEDIUM",
    reasonCode: "FIELD_CONDITION",
    requestedAt: "2026-05-21T14:00:00.000Z",
    dueDate: "2026-06-01T00:00:00.000Z",
    approvedAt: null,
    approver: "",
    notes: "Some notes",
    area: "42",
    createdById: 7,
    createdAt: "2026-05-21T14:00:00.000Z",
    updatedAt: "2026-05-21T14:00:00.000Z",
    ...partial,
  };
}

const noopArea = (raw: string) => `area:${raw}`;

describe("cvrCsvColumns", () => {
  it("produces a non-empty, unique set of column headers", () => {
    const cols = cvrCsvColumns(noopArea);
    const headers = cols.map((c) => c.header);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect(h.length).toBeGreaterThan(0);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("every column extractor runs against a fully-populated row without throwing", () => {
    const cols = cvrCsvColumns(noopArea);
    const row = cvr();
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("every column extractor runs against a sparsely-populated row without throwing", () => {
    // The combinations most likely to expose a missed null-guard: empty
    // strings, null dates, no cbsCodes, no area, unknown discipline id.
    const cols = cvrCsvColumns(noopArea);
    const row = cvr({
      cvrNumber: "",
      title: "",
      description: "",
      discipline: "nope-not-a-real-id",
      cbsCodes: [],
      originator: "",
      approver: "",
      reasonCode: "",
      area: "",
      dueDate: null,
      approvedAt: null,
      notes: "",
    });
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("returns only primitive cell values that the CSV serializer can handle", () => {
    // rowsToCsv accepts string | number | boolean | null | undefined per
    // CsvColumn — anything else (Date, object, array) silently leaks via
    // String(...) and produces a useless cell. Guard against regressions.
    const cols = cvrCsvColumns(noopArea);
    const row = cvr();
    for (const c of cols) {
      const v = c.get(row);
      const ok =
        v === null ||
        v === undefined ||
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean";
      expect(ok, `${c.header} returned ${typeof v}`).toBe(true);
    }
  });

  it("only invokes areaLabel for non-empty area ids", () => {
    let calls = 0;
    const tracking = (raw: string) => {
      calls += 1;
      return raw;
    };
    const cols = cvrCsvColumns(tracking);
    const areaCol = cols.find((c) => c.header === "Area");
    expect(areaCol).toBeDefined();

    areaCol!.get(cvr({ area: "" }));
    expect(calls).toBe(0);

    areaCol!.get(cvr({ area: "17" }));
    expect(calls).toBe(1);
  });

  it("end-to-end: rowsToCsv produces a header row and one body row per item", () => {
    // Integration check — proves the column shape is actually accepted by
    // rowsToCsv and that the full pipeline doesn't throw on a real row.
    const csv = rowsToCsv([cvr(), cvr({ id: 2, cvrNumber: "CVR-002" })], cvrCsvColumns(noopArea));
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toContain("CVR #");
    expect(lines[1]).toContain("CVR-001");
    expect(lines[2]).toContain("CVR-002");
  });
});

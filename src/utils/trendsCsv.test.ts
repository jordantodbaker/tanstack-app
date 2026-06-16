import { describe, expect, it } from "vitest";
import type { TrendItem } from "./trends";
import { rowsToCsv } from "~/lib/csv-export";
import { trendCsvColumns } from "./trendsCsv";

function trend(partial: Partial<TrendItem> = {}): TrendItem {
  return {
    id: 1,
    projectId: 1,
    trendNumber: "TRD-001",
    title: "Bigger crane required",
    description: "Detailed description.",
    status: "IDENTIFIED",
    priority: "NORMAL",
    discipline: "civil",
    cbsCodes: ["100", "101"],
    locationArea: "42",
    probability: 0.6,
    costLow: 5000,
    costLikely: 12000,
    costHigh: 25000,
    scheduleDaysImpact: 3,
    identifiedAt: "2026-05-21T14:00:00.000Z",
    neededBy: "2026-06-01T00:00:00.000Z",
    closedAt: null,
    linkedRfiId: null,
    linkedFcoId: null,
    linkedCvrId: null,
    initiatedBy: "alice@example.com",
    reasonNarrative: "Original spec underestimated lift weight.",
    notes: "Some notes",
    createdById: 7,
    createdAt: "2026-05-21T14:00:00.000Z",
    updatedAt: "2026-05-21T14:00:00.000Z",
    ...partial,
  };
}

const noopArea = (raw: string) => `area:${raw}`;

describe("trendCsvColumns", () => {
  it("produces a non-empty, unique set of column headers", () => {
    const cols = trendCsvColumns(noopArea);
    const headers = cols.map((c) => c.header);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect(h.length).toBeGreaterThan(0);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("every column extractor runs against a fully-populated row without throwing", () => {
    const cols = trendCsvColumns(noopArea);
    const row = trend();
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("every column extractor runs against a sparsely-populated row without throwing", () => {
    const cols = trendCsvColumns(noopArea);
    const row = trend({
      trendNumber: "",
      title: "",
      description: "",
      discipline: "nope-not-a-real-id",
      cbsCodes: [],
      initiatedBy: "",
      reasonNarrative: "",
      notes: "",
      locationArea: "",
      neededBy: null,
      closedAt: null,
      linkedRfiId: null,
      linkedFcoId: null,
      linkedCvrId: null,
    });
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("returns only primitive cell values that the CSV serializer can handle", () => {
    const cols = trendCsvColumns(noopArea);
    const row = trend();
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

  it("only invokes areaLabel for non-empty locationArea values", () => {
    let calls = 0;
    const tracking = (raw: string) => {
      calls += 1;
      return raw;
    };
    const cols = trendCsvColumns(tracking);
    const areaCol = cols.find((c) => c.header === "Area");
    expect(areaCol).toBeDefined();

    areaCol!.get(trend({ locationArea: "" }));
    expect(calls).toBe(0);

    areaCol!.get(trend({ locationArea: "17" }));
    expect(calls).toBe(1);
  });

  it("end-to-end: rowsToCsv produces a header row and one body row per item", () => {
    const csv = rowsToCsv(
      [trend(), trend({ id: 2, trendNumber: "TRD-002" })],
      trendCsvColumns(noopArea),
    );
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Trend #");
    expect(lines[1]).toContain("TRD-001");
    expect(lines[2]).toContain("TRD-002");
  });
});

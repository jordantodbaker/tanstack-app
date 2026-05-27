import { describe, expect, it } from "vitest";
import type { FcoItem } from "./fcoLog";
import { rowsToCsv } from "~/lib/csv-export";
import { fcoCsvColumns } from "./fcoLogCsv";

function fco(partial: Partial<FcoItem> = {}): FcoItem {
  return {
    id: 1,
    projectId: 1,
    fcoNumber: "FCO-001",
    title: "Damaged flange",
    description: "Detailed description.",
    status: "DRAFT",
    originType: "FIELD_CONDITION",
    priority: "NORMAL",
    discipline: "piping",
    cbsCodes: ["600", "601"],
    locationArea: "42",
    drawingRefs: ["P-101"],
    rfiNumbers: ["RFI-12"],
    initiatedBy: "alice@example.com",
    fieldContact: "bob@example.com",
    estimatedCost: 12500,
    estimatedHours: 32,
    workStopped: false,
    photosUrl: "",
    reasonNarrative: "Flange found cracked during inspection.",
    resolution: "",
    notes: "Some notes",
    initiatedAt: "2026-05-21T14:00:00.000Z",
    neededBy: "2026-06-01T00:00:00.000Z",
    closedAt: null,
    linkedCvrId: null,
    linkedCvrNumber: null,
    linkedCvrTitle: null,
    linkedRfiId: null,
    linkedRfiNumber: null,
    linkedRfiSubject: null,
    createdById: 7,
    createdAt: "2026-05-21T14:00:00.000Z",
    updatedAt: "2026-05-21T14:00:00.000Z",
    ...partial,
  };
}

const noopArea = (raw: string) => `area:${raw}`;

describe("fcoCsvColumns", () => {
  it("produces a non-empty, unique set of column headers", () => {
    const cols = fcoCsvColumns(noopArea);
    const headers = cols.map((c) => c.header);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect(h.length).toBeGreaterThan(0);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("every column extractor runs against a fully-populated row without throwing", () => {
    const cols = fcoCsvColumns(noopArea);
    const row = fco();
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("every column extractor runs against a sparsely-populated row without throwing", () => {
    const cols = fcoCsvColumns(noopArea);
    const row = fco({
      fcoNumber: "",
      title: "",
      description: "",
      discipline: "nope-not-a-real-id",
      cbsCodes: [],
      drawingRefs: [],
      rfiNumbers: [],
      initiatedBy: "",
      fieldContact: "",
      reasonNarrative: "",
      resolution: "",
      notes: "",
      locationArea: "",
      neededBy: null,
      closedAt: null,
      linkedCvrNumber: null,
    });
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("returns only primitive cell values that the CSV serializer can handle", () => {
    const cols = fcoCsvColumns(noopArea);
    const row = fco();
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
    const cols = fcoCsvColumns(tracking);
    const areaCol = cols.find((c) => c.header === "Area");
    expect(areaCol).toBeDefined();

    areaCol!.get(fco({ locationArea: "" }));
    expect(calls).toBe(0);

    areaCol!.get(fco({ locationArea: "17" }));
    expect(calls).toBe(1);
  });

  it("renders workStopped as Yes/No", () => {
    const cols = fcoCsvColumns(noopArea);
    const col = cols.find((c) => c.header === "Work Stopped");
    expect(col).toBeDefined();
    expect(col!.get(fco({ workStopped: true }))).toBe("Yes");
    expect(col!.get(fco({ workStopped: false }))).toBe("No");
  });

  it("end-to-end: rowsToCsv produces a header row and one body row per item", () => {
    const csv = rowsToCsv(
      [fco(), fco({ id: 2, fcoNumber: "FCO-002" })],
      fcoCsvColumns(noopArea),
    );
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("FCO #");
    expect(lines[1]).toContain("FCO-001");
    expect(lines[2]).toContain("FCO-002");
  });
});

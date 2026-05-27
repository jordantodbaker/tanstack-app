import { describe, expect, it } from "vitest";
import type { RfiItem } from "./rfis";
import { rowsToCsv } from "~/lib/csv-export";
import { rfiCsvColumns } from "./rfisCsv";

function rfi(partial: Partial<RfiItem> = {}): RfiItem {
  return {
    id: 1,
    projectId: 1,
    rfiNumber: "RFI-001",
    subject: "Routing conflict on P-101",
    question: "Drawing conflicts with as-built — clarify routing.",
    status: "OPEN",
    priority: "NORMAL",
    discipline: "piping",
    cbsCodes: ["600", "601"],
    locationArea: "42",
    drawingRefs: ["P-101"],
    specRefs: ["15 05 13"],
    suspectsCostImpact: false,
    suspectsScheduleImpact: false,
    initiatedBy: "alice@example.com",
    assignedTo: "designer@firm.com",
    dueDate: "2026-06-01T00:00:00.000Z",
    initiatedAt: "2026-05-21T14:00:00.000Z",
    response: "",
    answeredBy: "",
    answeredAt: null,
    closedAt: null,
    createdById: 7,
    createdAt: "2026-05-21T14:00:00.000Z",
    updatedAt: "2026-05-21T14:00:00.000Z",
    linkedFcos: [],
    ...partial,
  };
}

const noopArea = (raw: string) => `area:${raw}`;

describe("rfiCsvColumns", () => {
  it("produces a non-empty, unique set of column headers", () => {
    const cols = rfiCsvColumns(noopArea);
    const headers = cols.map((c) => c.header);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect(h.length).toBeGreaterThan(0);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("every column extractor runs against a fully-populated row without throwing", () => {
    const cols = rfiCsvColumns(noopArea);
    const row = rfi();
    for (const c of cols) expect(() => c.get(row)).not.toThrow();
  });

  it("every column extractor runs against a sparse row without throwing", () => {
    const cols = rfiCsvColumns(noopArea);
    const row = rfi({
      rfiNumber: "",
      subject: "",
      question: "",
      discipline: "nope-not-a-real-id",
      cbsCodes: [],
      drawingRefs: [],
      specRefs: [],
      initiatedBy: "",
      assignedTo: "",
      locationArea: "",
      dueDate: null,
    });
    for (const c of cols) expect(() => c.get(row)).not.toThrow();
  });

  it("returns only primitive cell values that the CSV serializer can handle", () => {
    const cols = rfiCsvColumns(noopArea);
    const row = rfi();
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
    const cols = rfiCsvColumns(tracking);
    const areaCol = cols.find((c) => c.header === "Area");
    expect(areaCol).toBeDefined();

    areaCol!.get(rfi({ locationArea: "" }));
    expect(calls).toBe(0);

    areaCol!.get(rfi({ locationArea: "17" }));
    expect(calls).toBe(1);
  });

  it("renders suspects-impact flags as Yes/No", () => {
    const cols = rfiCsvColumns(noopArea);
    const costCol = cols.find((c) => c.header === "Suspects Cost Impact");
    const schedCol = cols.find(
      (c) => c.header === "Suspects Schedule Impact",
    );
    expect(costCol!.get(rfi({ suspectsCostImpact: true }))).toBe("Yes");
    expect(costCol!.get(rfi({ suspectsCostImpact: false }))).toBe("No");
    expect(schedCol!.get(rfi({ suspectsScheduleImpact: true }))).toBe("Yes");
    expect(schedCol!.get(rfi({ suspectsScheduleImpact: false }))).toBe("No");
  });

  it("joins linked FCO numbers with a semicolon", () => {
    const cols = rfiCsvColumns(noopArea);
    const col = cols.find((c) => c.header === "Linked FCOs");
    expect(col).toBeDefined();
    expect(
      col!.get(
        rfi({
          linkedFcos: [
            { id: 1, fcoNumber: "FCO-001", title: "x", status: "DRAFT" },
            { id: 2, fcoNumber: "FCO-002", title: "y", status: "DRAFT" },
          ],
        }),
      ),
    ).toBe("FCO-001; FCO-002");
    expect(col!.get(rfi())).toBe("");
  });

  it("end-to-end: rowsToCsv produces a header row and one body row per item", () => {
    const csv = rowsToCsv(
      [rfi(), rfi({ id: 2, rfiNumber: "RFI-002" })],
      rfiCsvColumns(noopArea),
    );
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("RFI #");
    expect(lines[1]).toContain("RFI-001");
    expect(lines[2]).toContain("RFI-002");
  });
});

import { describe, expect, it } from "vitest";
import type { PcoItem } from "./pco";
import { rowsToCsv } from "~/lib/csv-export";
import { pcoCsvColumns } from "./pcoCsv";

function pco(partial: Partial<PcoItem> = {}): PcoItem {
  return {
    id: 1,
    projectId: 1,
    pcoNumber: "PCO-001",
    ownerReference: "OWNER-42",
    title: "Soil disposal change",
    description: "Detailed description.",
    status: "DRAFT",
    priority: "NORMAL",
    requestedAmount: 50000,
    approvedAmount: 0,
    scheduleDaysImpact: 5,
    ownerRepName: "Jane Owner",
    ownerRepEmail: "jane@example.com",
    submittedAt: null,
    approvedAt: null,
    invoicedAt: null,
    invoiceNumber: "",
    paidAt: null,
    closedAt: null,
    initiatedBy: "alice@example.com",
    reasonNarrative: "Soil contamination required offsite disposal.",
    notes: "Some notes",
    createdById: 7,
    createdAt: "2026-05-21T14:00:00.000Z",
    updatedAt: "2026-05-21T14:00:00.000Z",
    linkedCvrs: [
      {
        id: 100,
        cvrNumber: "CVR-010",
        title: "Linked",
        status: "APPROVED",
        costImpact: 35000,
      },
    ],
    ...partial,
  };
}

describe("pcoCsvColumns", () => {
  it("produces a non-empty, unique set of column headers", () => {
    const cols = pcoCsvColumns();
    const headers = cols.map((c) => c.header);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect(h.length).toBeGreaterThan(0);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("every column extractor runs against a fully-populated row without throwing", () => {
    const cols = pcoCsvColumns();
    const row = pco();
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("every column extractor runs against a sparsely-populated row without throwing", () => {
    const cols = pcoCsvColumns();
    const row = pco({
      pcoNumber: "",
      ownerReference: "",
      title: "",
      description: "",
      ownerRepName: "",
      ownerRepEmail: "",
      invoiceNumber: "",
      initiatedBy: "",
      reasonNarrative: "",
      notes: "",
      submittedAt: null,
      approvedAt: null,
      invoicedAt: null,
      paidAt: null,
      closedAt: null,
      linkedCvrs: [],
    });
    for (const c of cols) {
      expect(() => c.get(row)).not.toThrow();
    }
  });

  it("returns only primitive cell values that the CSV serializer can handle", () => {
    const cols = pcoCsvColumns();
    const row = pco();
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

  it("joins linked CVR numbers with '; '", () => {
    const cols = pcoCsvColumns();
    const col = cols.find((c) => c.header === "Linked CVRs");
    expect(col).toBeDefined();
    const out = col!.get(
      pco({
        linkedCvrs: [
          {
            id: 1,
            cvrNumber: "CVR-001",
            title: "A",
            status: "DRAFT",
            costImpact: 100,
          },
          {
            id: 2,
            cvrNumber: "CVR-002",
            title: "B",
            status: "APPROVED",
            costImpact: 200,
          },
        ],
      }),
    );
    expect(out).toBe("CVR-001; CVR-002");
  });

  it("falls back to `CVR #<id>` when a linked CVR has an empty number", () => {
    const cols = pcoCsvColumns();
    const col = cols.find((c) => c.header === "Linked CVRs");
    const out = col!.get(
      pco({
        linkedCvrs: [
          {
            id: 99,
            cvrNumber: "",
            title: "Untitled",
            status: "DRAFT",
            costImpact: 0,
          },
        ],
      }),
    );
    expect(out).toBe("CVR #99");
  });

  it("sums linked CVR cost impacts", () => {
    const cols = pcoCsvColumns();
    const col = cols.find((c) => c.header === "Linked CVR Total Cost Impact ($)");
    expect(col).toBeDefined();
    const out = col!.get(
      pco({
        linkedCvrs: [
          { id: 1, cvrNumber: "A", title: "", status: "", costImpact: 100 },
          { id: 2, cvrNumber: "B", title: "", status: "", costImpact: 250 },
          { id: 3, cvrNumber: "C", title: "", status: "", costImpact: -50 },
        ],
      }),
    );
    expect(out).toBe(300);
  });

  it("end-to-end: rowsToCsv produces a header row and one body row per item", () => {
    const csv = rowsToCsv(
      [pco(), pco({ id: 2, pcoNumber: "PCO-002" })],
      pcoCsvColumns(),
    );
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("PCO #");
    expect(lines[1]).toContain("PCO-001");
    expect(lines[2]).toContain("PCO-002");
  });
});

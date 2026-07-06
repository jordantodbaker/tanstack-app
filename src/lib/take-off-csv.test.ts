import { describe, expect, it } from "vitest";
import {
  takeOffCsvColumns,
  makeTakeOffCsvColumns,
  takeOffRowsForExport,
} from "./take-off-csv";
import { rowsToCsv } from "./csv-export";
import { TAKE_OFF_PASTE_COLUMNS, parseTakeOffPaste } from "./take-off-paste";
import { makeFefRow } from "./fef-helpers";
import type { CbsOption } from "./types";

describe("takeOffCsvColumns", () => {
  it("leads with the paste columns in the same order (round-trip safe)", () => {
    expect(
      takeOffCsvColumns.slice(0, TAKE_OFF_PASTE_COLUMNS.length).map((c) => c.header),
    ).toEqual([...TAKE_OFF_PASTE_COLUMNS]);
  });

  it("emits the Area label (importable) plus a raw Area ID reference column", () => {
    const cols = makeTakeOffCsvColumns((id) => (id === "3" ? "A1 — Foundation" : id));
    const row = makeFefRow({ id: "601-C0-0000-00-M", area: "3" });
    const csv = rowsToCsv([row], cols);
    // "Area" column carries the label; "Area ID" carries the raw id.
    expect(csv).toContain("A1 — Foundation");
    const headers = csv.trim().split("\r\n")[0].split(",");
    expect(headers[5]).toBe("Area"); // importable, 6th column
    expect(headers).toContain("Area ID");
  });

  it("emits the CBS code (blank for template rows) and a numeric total cost", () => {
    const csv = rowsToCsv(
      [
        makeFefRow({
          id: "601-C0-0000-00-M",
          description: "Pipe",
          quantity: "100",
          laborFactor: "1.5",
          laborRate: "55",
          laborHours: "150",
          name: "Carbon Steel Pipe",
        }),
      ],
      takeOffCsvColumns,
    );
    const [header, row] = csv.trim().split("\r\n");
    expect(header.startsWith("CBS Code,Description,Quantity")).toBe(true);
    expect(row).toContain("601-C0-0000-00-M");
    expect(row).toContain("8250"); // 150 × 55 total cost, unformatted number
  });

  it("round-trips through the paste importer (export order → tab-paste), area label → id", () => {
    const row = makeFefRow({
      id: "601-C0-0000-00-M",
      description: "Pipe spool",
      quantity: "100",
      laborFactor: "1.5",
      laborRate: "55",
      area: "3",
    });
    const areaOptions = [{ value: "3", label: "A1 — Foundation" }];
    const cols = makeTakeOffCsvColumns(
      (id) => areaOptions.find((o) => o.value === id)?.label ?? id,
    );
    // Simulate Excel: take the paste columns, tab-join, re-import.
    const cells = cols
      .slice(0, TAKE_OFF_PASTE_COLUMNS.length)
      .map((c) => String(c.get(row)));
    const opts: CbsOption[] = [
      {
        displayCode: "601-C0-0000-00-M",
        costCode: "601C0000000M",
        name: "Carbon Steel Pipe",
        uom: "LF",
        displayDescription: null,
        subReporting: null,
      },
    ];
    const { rows } = parseTakeOffPaste(cells.join("\t"), opts, areaOptions);
    expect(rows[0]).toMatchObject({
      id: "601-C0-0000-00-M",
      description: "Pipe spool",
      quantity: "100",
      laborFactor: "1.5",
      laborRate: "55",
      name: "Carbon Steel Pipe",
      area: "3", // exported "A1 — Foundation" resolved back to the id
    });
  });
});

describe("takeOffRowsForExport", () => {
  it("drops blank template rows but keeps started ones", () => {
    const rows = [
      makeFefRow({ id: "601-C0-0000-00-M", name: "Pipe" }),
      makeFefRow({ id: "__fe-blank-9" }), // empty template → dropped
      makeFefRow({ id: "__fe-blank-1", quantity: "5" }), // started → kept
      makeFefRow({ id: "", name: "Note" }), // code-less data → kept
    ];
    expect(takeOffRowsForExport(rows)).toHaveLength(3);
  });
});

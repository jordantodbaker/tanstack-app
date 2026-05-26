import { describe, expect, it } from "vitest";
import { rowsToCsv, type CsvColumn } from "./csv-export";

type Row = { id: number; name: string; cost: number; notes: string | null };

const columns: CsvColumn<Row>[] = [
  { header: "ID", get: (r) => r.id },
  { header: "Name", get: (r) => r.name },
  { header: "Cost", get: (r) => r.cost },
  { header: "Notes", get: (r) => r.notes },
];

describe("rowsToCsv", () => {
  it("emits a header row followed by one row per input, CRLF-terminated", () => {
    const csv = rowsToCsv(
      [
        { id: 1, name: "Foo", cost: 100, notes: null },
        { id: 2, name: "Bar", cost: 250, notes: "x" },
      ],
      columns,
    );
    expect(csv).toBe(
      "ID,Name,Cost,Notes\r\n" + "1,Foo,100,\r\n" + "2,Bar,250,x\r\n",
    );
  });

  it("returns just the header row for an empty input array", () => {
    expect(rowsToCsv([], columns)).toBe("ID,Name,Cost,Notes\r\n");
  });

  it("treats null and undefined cell values as empty fields", () => {
    const csv = rowsToCsv(
      [{ id: 1, name: "", cost: 0, notes: null }],
      columns,
    );
    expect(csv).toBe("ID,Name,Cost,Notes\r\n" + "1,,0,\r\n");
  });

  describe("RFC 4180 escaping", () => {
    it("quotes values containing a comma", () => {
      const csv = rowsToCsv(
        [{ id: 1, name: "Smith, John", cost: 0, notes: null }],
        columns,
      );
      expect(csv).toContain(`"Smith, John"`);
    });

    it("quotes values containing a double-quote and doubles the embedded quote", () => {
      // Cell value: He said "hi"
      // Expected:   "He said ""hi"""
      const csv = rowsToCsv(
        [{ id: 1, name: 'He said "hi"', cost: 0, notes: null }],
        columns,
      );
      expect(csv).toContain(`"He said ""hi"""`);
    });

    it("quotes values containing newlines (preserves multi-line cells)", () => {
      const csv = rowsToCsv(
        [{ id: 1, name: "Line 1\nLine 2", cost: 0, notes: null }],
        columns,
      );
      expect(csv).toContain(`"Line 1\nLine 2"`);
    });

    it("doesn't quote ordinary values (no unnecessary wrapping)", () => {
      const csv = rowsToCsv(
        [{ id: 1, name: "Plain", cost: 99.5, notes: "ok" }],
        columns,
      );
      // None of the cells contain comma / quote / newline, so none should
      // be wrapped — keeps the file smaller and human-readable.
      expect(csv).toBe("ID,Name,Cost,Notes\r\n" + "1,Plain,99.5,ok\r\n");
    });
  });

  it("stringifies numbers and booleans directly", () => {
    const numCols: CsvColumn<{ n: number; b: boolean }>[] = [
      { header: "N", get: (r) => r.n },
      { header: "B", get: (r) => r.b },
    ];
    const csv = rowsToCsv(
      [
        { n: 42, b: true },
        { n: -3.14, b: false },
      ],
      numCols,
    );
    expect(csv).toBe("N,B\r\n" + "42,true\r\n" + "-3.14,false\r\n");
  });
});

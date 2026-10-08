import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatCbsWorkbookReport,
  loadCbsWorkbook,
} from "../../prisma/cbs-workbook";

/**
 * Exercises the workbook loader on small workbooks generated here, so the
 * parsing rules (header detection, code validation, duplicate handling,
 * flag parsing, twin generation, ordering) are pinned without a fixture file.
 */

const HEADERS = [
  "L1", // workbook helper column — ignored by the loader
  "Name",
  "Display Code",
  "UOM",
  "Sub Code",
  "Material Code",
  "Material Type",
  "Cost Center",
  "Cost Classification",
  "Status",
  "Account Description",
  "L2 Description",
  "Core",
  "Core Extension",
  "WBS",
  "P6 Cost Account (L1-4)",
  "G/L",
  "Discipline",
  "Cost Code",
  "Description",
  "Notes",
];

type Cells = Partial<Record<(typeof HEADERS)[number], string>>;

function toRow(cells: Cells): string[] {
  return HEADERS.map((h) => cells[h] ?? "");
}

/** Shorthand for a data row: code + name + flags, with a consistent cost code. */
function r(code: string, name: string, extra: Cells = {}): Cells {
  return {
    Name: name,
    "Display Code": code,
    UOM: "LS",
    "Sub Code": "NO",
    "Material Code": "NO",
    Status: "Active",
    "Account Description": name,
    "Cost Code": code.toUpperCase().replace(/-/g, ""),
    Description: `Summary of ${name}.`,
    ...extra,
  };
}

async function writeWorkbook(
  path: string,
  sheets: { name: string; rows: string[][] }[],
) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const row of s.rows) ws.addRow(row);
  }
  await wb.xlsx.writeFile(path);
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "master-cbs-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCbsWorkbook", () => {
  it("parses the Master CBS sheet, validates codes, de-duplicates and expands twins", async () => {
    const path = join(dir, "master.xlsx");
    await writeWorkbook(path, [
      {
        name: "Master CBS",
        rows: [
          HEADERS,
          toRow(r("100-00-0000-00-0", "Civil", { "Sub Code": "YES", "Material Code": "YES" })),
          toRow(r("101-00-0000-00-0", "Civil Shop Materials", { "Material Code": "YES" })),
          // Already present in the workbook → its generated twin is skipped.
          toRow(r("101-00-0000-00-M", "Civil Shop Materials")),
          // Cost Code cell disagrees with the Display Code → derived wins, counted.
          toRow(r("101-05-0000-00-0", "Earthwork", { "Cost Code": "WRONG" })),
          toRow(r("101-10-0000-00-0", "Piling")),
          // Duplicate of a named row → dropped.
          toRow(r("101-10-0000-00-0", "Piling (dup)")),
          // Nameless row followed by its named duplicate → the named one wins.
          toRow(r("700-00-0000-00-0", "")),
          toRow(r("700-00-0000-00-0", "Electrical")),
          // Invalid code → reported and skipped.
          toRow(r("BAD-CODE", "Oops")),
          // Blank row → ignored entirely.
          toRow({}),
          // Blank flags → null.
          toRow(r("101-15-0000-00-0", "Underground", { "Sub Code": "", "Material Code": "" })),
          // Lower-case code → normalised to upper case.
          toRow(r("101-20-0000-00-l", "Lowercase")),
        ],
      },
    ]);

    const { items, report } = await loadCbsWorkbook(path);

    expect(report.sheet).toBe("Master CBS");
    expect(report.sheetRows).toBe(11);
    expect(report.originals).toBe(8);
    expect(report.generatedSub).toBe(1);
    expect(report.generatedMaterial).toBe(1);
    expect(report.skippedExistingSub).toBe(0);
    expect(report.skippedExistingMaterial).toBe(1);
    expect(report.costCodeMismatches).toBe(1);
    expect(report.invalid).toEqual([
      { row: 10, displayCode: "BAD-CODE", name: "Oops", reason: "display code is not XXX-XX-XXXX-XX-X" },
    ]);
    expect(report.duplicates).toEqual([
      { row: 7, displayCode: "101-10-0000-00-0", name: "Piling (dup)", kept: false },
      { row: 9, displayCode: "700-00-0000-00-0", name: "Electrical", kept: true },
    ]);

    // Dictionary order: parents first, each original followed by its twins.
    expect(items.map((i) => i.displayCode)).toEqual([
      "100-00-0000-00-0",
      "100-00-0000-00-S",
      "100-00-0000-00-M",
      "101-00-0000-00-0",
      "101-00-0000-00-M",
      "101-05-0000-00-0",
      "101-10-0000-00-0",
      "101-15-0000-00-0",
      "101-20-0000-00-L",
      "700-00-0000-00-0",
    ]);

    const byCode = new Map(items.map((i) => [i.displayCode, i]));
    expect(byCode.get("101-10-0000-00-0")?.name).toBe("Piling");
    expect(byCode.get("700-00-0000-00-0")?.name).toBe("Electrical");
    expect(byCode.get("101-05-0000-00-0")?.costCode).toBe("101050000000");
    expect(byCode.get("101-15-0000-00-0")).toMatchObject({
      subReporting: null,
      materialCode: null,
    });
    expect(byCode.get("100-00-0000-00-0")).toMatchObject({
      l1: "100",
      l2: "00",
      l6: "0",
      subReporting: true,
      materialCode: true,
      rowType: "ORIGINAL",
      displayDescription: "100-00-0000-00-0:  Civil",
    });
    expect(byCode.get("100-00-0000-00-S")).toMatchObject({
      name: "Civil Subcontracts",
      l6: "S",
      costCode: "10000000000S",
      gl: "5200",
      rowType: "SUB",
      generatedFrom: "100-00-0000-00-0",
    });
    // The workbook's own M row is kept as an original, not replaced by a twin.
    expect(byCode.get("101-00-0000-00-M")?.rowType).toBe("ORIGINAL");
  });

  it("finds the header below a title block and falls back to the first sheet", async () => {
    const path = join(dir, "titled.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS S-M Generated",
        rows: [
          ["CBS Dictionary – Civil"],
          ["Live list of CBS rows"],
          ["Total rows:", "", "1"],
          HEADERS,
          toRow(r("100-00-0000-00-0", "Civil")),
        ],
      },
    ]);
    const { items, report } = await loadCbsWorkbook(path);
    expect(report.sheet).toBe("CBS S-M Generated");
    expect(items.map((i) => i.displayCode)).toEqual(["100-00-0000-00-0"]);
  });

  it("rejects a workbook without a Display Code header", async () => {
    const path = join(dir, "no-header.xlsx");
    await writeWorkbook(path, [
      { name: "Master CBS", rows: [["Name", "Code"], ["Civil", "100"]] },
    ]);
    await expect(loadCbsWorkbook(path)).rejects.toThrow(/no header row/);
  });

  /**
   * The sheet carries L1–L7 helper columns beside the Display Code. The loader
   * derives every level segment from the CODE, because the two disagreed in
   * ~1,100 rows of the first master and the code is what the app stores on
   * estimate rows. That makes a half-finished renumber — helper columns moved,
   * Display Code left behind — silent, so the report calls it out.
   */
  it("reports rows whose L1–L7 columns disagree with the Display Code", async () => {
    const FULL = [
      "L1", "L2", "L3", "L4", "L5", "L6", "L7",
      "Name", "Display Code", "Cost Code",
    ];
    /** A row with explicit segment columns, which may or may not match the code. */
    const seg = (
      segments: string,
      code: string,
      name: string,
    ): string[] => [
      segments.slice(0, 2), segments.slice(2, 3),
      segments.slice(3, 5), segments.slice(5, 7), segments.slice(7, 9),
      segments.slice(9, 11), segments.slice(11, 12),
      name, code, code.replace(/-/g, ""),
    ];

    const path = join(dir, "segments.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS",
        rows: [
          FULL,
          // Agrees — not reported.
          seg("100000000000", "100-00-0000-00-0", "Civil"),
          // A renumbered block: columns say 680, the codes still say 700.
          seg("680000000000", "700-00-0000-00-0", "Steam Tracing & Tubing"),
          seg("68010000000L", "700-10-0000-00-L", "Install Supports"),
          seg("68020000000L", "700-20-0000-00-L", "Install Steam Tracing"),
          // A different move, so a second group.
          seg("01410000000E", "054-10-0000-00-E", "Owned Equipment"),
        ],
      },
    ]);

    const { items, report } = await loadCbsWorkbook(path);

    // One line per division move, not per row — a real block runs to dozens.
    expect(report.segmentMismatches).toEqual([
      {
        columnsL1: "680",
        codeL1: "700",
        rows: 3,
        sample: { row: 3, name: "Steam Tracing & Tubing" },
      },
      {
        columnsL1: "014",
        codeL1: "054",
        rows: 1,
        sample: { row: 6, name: "Owned Equipment" },
      },
    ]);

    // The code still wins: the rows import under 700, which is the point.
    expect(
      items.find((i) => i.name === "Steam Tracing & Tubing")?.l1,
    ).toBe("700");

    const text = formatCbsWorkbookReport(report);
    expect(text).toContain("4 row(s) whose L1–L7 columns disagree");
    expect(text).toContain("L1 columns say 680, Display Codes say 700");
  });

  it("reports nothing when the sheet has no L1–L7 columns to compare", async () => {
    // The dictionary-style exports carry only a subset; absence is not a
    // disagreement.
    const path = join(dir, "no-segments.xlsx");
    await writeWorkbook(path, [
      { name: "CBS", rows: [HEADERS, toRow(r("100-00-0000-00-0", "Civil"))] },
    ]);
    const { report } = await loadCbsWorkbook(path);
    expect(report.segmentMismatches).toEqual([]);
  });
});

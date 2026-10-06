import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMasterCbs } from "../../prisma/master-cbs";

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

describe("loadMasterCbs", () => {
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

    const { items, report } = await loadMasterCbs(path);

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
    const { items, report } = await loadMasterCbs(path);
    expect(report.sheet).toBe("CBS S-M Generated");
    expect(items.map((i) => i.displayCode)).toEqual(["100-00-0000-00-0"]);
  });

  it("rejects a workbook without a Display Code header", async () => {
    const path = join(dir, "no-header.xlsx");
    await writeWorkbook(path, [
      { name: "Master CBS", rows: [["Name", "Code"], ["Civil", "100"]] },
    ]);
    await expect(loadMasterCbs(path)).rejects.toThrow(/no header row/);
  });
});

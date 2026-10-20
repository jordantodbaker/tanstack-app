import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cellAddress,
  cellText,
  openCbsSheet,
  writeCbsWorkbookCells,
} from "../../prisma/cbs-workbook-cells";

/**
 * The write side the repair and rename scripts share. What matters is that it
 * changes exactly the cells it names and nothing else — CBS.xlsx is the master
 * data file, and a stray write lands in every future import.
 */

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cbs-cells-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function workbook(name: string, rows: string[][], sheet = "Expanded CBS") {
  const path = join(dir, name);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  for (const r of rows) ws.addRow(r);
  await wb.xlsx.writeFile(path);
  return path;
}

const ROWS = [
  ["L1", "Name", "Display Code", "Cost Code"],
  ["02", "Combined Phase (*)", "022-00-0000-00-0-S", "02200000000S"],
  ["10", "Civil", "100-00-0000-00-0", "100000000000"],
];

describe("openCbsSheet", () => {
  it("indexes columns by header, whatever the sheet is called", async () => {
    const path = await workbook("open.xlsx", ROWS, "Something Else");
    const sheet = await openCbsSheet(path);
    expect(sheet.column).toMatchObject({ Name: 2, "Display Code": 3 });
    expect(cellAddress(sheet, "Display Code", 2)).toBe("C2");
    expect(cellText(sheet, sheet.ws.getRow(3), "Name")).toBe("Civil");
  });
});

describe("writeCbsWorkbookCells", () => {
  it("rewrites the named cells and leaves the rest alone", async () => {
    const path = await workbook("write.xlsx", ROWS);
    const { cells } = await writeCbsWorkbookCells(
      [
        { cell: "C2", value: "022-00-0000-00-S" },
        { cell: "B3", value: "Civil & Site <Works>" },
      ],
      path,
    );
    expect(cells).toEqual(["C2", "B3"]);

    const sheet = await openCbsSheet(path);
    const text = (r: number, label: string) =>
      cellText(sheet, sheet.ws.getRow(r), label);
    expect(text(2, "Display Code")).toBe("022-00-0000-00-S");
    // Escaped on the way in, so the XML stays valid and the text survives.
    expect(text(3, "Name")).toBe("Civil & Site <Works>");
    expect(text(2, "Name")).toBe("Combined Phase (*)");
    expect(text(3, "Display Code")).toBe("100-00-0000-00-0");
  });

  it("writes nothing when any cell is missing", async () => {
    const path = await workbook("missing.xlsx", ROWS);
    const before = readFileSync(path);
    await expect(
      writeCbsWorkbookCells(
        [
          { cell: "C2", value: "022-00-0000-00-S" },
          { cell: "Z99", value: "nowhere" },
        ],
        path,
      ),
    ).rejects.toThrow(/Z99 not found/);
    expect(readFileSync(path).equals(before)).toBe(true);
  });
});

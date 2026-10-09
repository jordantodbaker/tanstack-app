import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildCbsTree,
  parseCbsDisplayCode,
  type CbsTreeItem,
} from "~/lib/cbs-tree";
import { CBS_EXPORT_COLUMNS, flattenCbsForExport } from "~/lib/cbs-export";
import { cbsColorForLevel, CBS_HEADER_COLOR } from "~/config/cbs-level-colors";
import { buildCbsWorkbook, type CbsWorkbookMeta } from "./cbs-xlsx.server";

/**
 * Round-trips the workbook: build it, read the bytes back with exceljs, and
 * assert the things a user would notice. Asserting on the builder's inputs
 * would prove nothing about the file — the fills, the grouping direction and
 * the text format are all Excel semantics that only show up once written.
 */

let nextId = 1;
function item(code: string, over: Partial<CbsTreeItem> = {}): CbsTreeItem {
  return {
    id: nextId++,
    ...parseCbsDisplayCode(code),
    displayCode: code,
    name: "",
    accountDescription: "",
    uom: "",
    rowType: "ORIGINAL",
    ...over,
  };
}

const ROWS = flattenCbsForExport(
  buildCbsTree([
    item("050-00-0000-00-0", { name: "Field Indirects" }),
    item("052-00-0000-00-0", { name: "Field Staff" }),
    item("052-15-0000-00-L", { name: "Superintendents" }),
    item("052-15-0500-00-L", { name: "Supers - General Field", uom: "HR" }),
    item("052-25-0000-00-0", { name: "Administration", context: true }),
  ]),
);

const META: CbsWorkbookMeta = {
  view: "projectCostCodes",
  scope: "1901 — FIME Engineering",
  filterNote: "Filtered: subcontract codes",
  availableRows: 4,
};

/** Builds the workbook and reads it back. */
async function roundTrip(rows = ROWS, meta = META) {
  const buffer = await buildCbsWorkbook(rows, meta);
  const wb = new ExcelJS.Workbook();
  // exceljs's `load` types predate Node's generic Buffer; the bytes are fine.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  return { buffer, wb, ws };
}

/** exceljs reads fills back as ARGB; our palette is "#RRGGBB". */
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const fillOf = (cell: ExcelJS.Cell) =>
  (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

/** Data rows start after the title, subtitle and header rows. */
const FIRST_DATA_ROW = 4;

describe("buildCbsWorkbook", () => {
  it("produces a loadable xlsx with the view's sheet name", async () => {
    const { buffer, ws } = await roundTrip();
    // A real zip container, not an empty or truncated buffer.
    expect(buffer.length).toBeGreaterThan(2000);
    // "PK" — an xlsx is a zip container.
    expect([buffer[0], buffer[1]]).toEqual([0x50, 0x4b]);
    expect(ws.name).toBe("Project Cost Codes");
  });

  it("writes the title block and the filter note", async () => {
    const { ws } = await roundTrip();
    expect(ws.getRow(1).getCell(1).value).toBe("Project Cost Codes");
    const subtitle = String(ws.getRow(2).getCell(1).value);
    expect(subtitle).toContain("1901 — FIME Engineering");
    expect(subtitle).toContain("4 codes");
    expect(subtitle).toContain("Filtered: subcontract codes");
  });

  it("writes the header row in the scheme's header colour", async () => {
    const { ws } = await roundTrip();
    const header = ws.getRow(3);
    expect(header.getCell(1).value).toBe("Display Code");
    expect(
      CBS_EXPORT_COLUMNS.map((_, i) => header.getCell(i + 1).value),
    ).toEqual(CBS_EXPORT_COLUMNS.map((c) => c.header));
    expect(fillOf(header.getCell(1))).toBe(argb(CBS_HEADER_COLOR.fill));
    expect(header.font?.bold).toBe(true);
  });

  it("groups rows by tree depth, with the summary ABOVE its children", async () => {
    const { ws } = await roundTrip();
    expect(
      ROWS.map((_, i) => ws.getRow(FIRST_DATA_ROW + i).outlineLevel),
    ).toEqual(ROWS.map((r) => r.outlineLevel));

    // Our parents sit above their children, the opposite of Excel's default.
    // Without this the +/- control attaches to the wrong row and collapsing
    // hides the parent instead of the branch beneath it.
    expect(ws.properties.outlineProperties?.summaryBelow).toBe(false);
  });

  it("fills each row from its CODE level, matching the page's colouring", async () => {
    const { ws } = await roundTrip();
    for (const [i, row] of ROWS.entries()) {
      const cell = ws.getRow(FIRST_DATA_ROW + i).getCell(1);
      expect(fillOf(cell)).toBe(argb(cbsColorForLevel(row.level).fill));
    }
    // L0 is the distinct red the page gives the discipline roots, not the
    // workbook's gold — a regression here would be invisible in the UI tests.
    expect(fillOf(ws.getRow(FIRST_DATA_ROW).getCell(1))).toBe(
      argb(cbsColorForLevel(0).fill),
    );
  });

  it("italicises a context row and leaves the rest upright", async () => {
    const { ws } = await roundTrip();
    const contextIndex = ROWS.findIndex((r) => r.context);
    expect(contextIndex).toBeGreaterThan(-1);
    expect(
      ws.getRow(FIRST_DATA_ROW + contextIndex).getCell(2).font?.italic,
    ).toBe(true);
    // exceljs omits `italic: false` rather than writing it, so assert falsy.
    expect(ws.getRow(FIRST_DATA_ROW).getCell(2).font?.italic).toBeFalsy();
  });

  it("keeps display codes as text so Excel can't eat the leading zero", async () => {
    const { ws } = await roundTrip();
    const cell = ws.getRow(FIRST_DATA_ROW).getCell(1);
    expect(cell.value).toBe("050-00-0000-00-0");
    expect(cell.numFmt).toBe("@");
  });

  it("freezes the header and sets an autofilter over it", async () => {
    const { ws } = await roundTrip();
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
    // exceljs normalises the range to A1 notation on the way back out.
    const lastCol = String.fromCharCode(64 + CBS_EXPORT_COLUMNS.length);
    expect(ws.autoFilter).toBe(`A3:${lastCol}3`);
  });

  it("sets a width on every column", async () => {
    const { ws } = await roundTrip();
    CBS_EXPORT_COLUMNS.forEach((c, i) => {
      expect(ws.getColumn(i + 1).width).toBe(c.width);
    });
  });

  it("names the sheet for whichever view was exported", async () => {
    for (const [view, sheet] of [
      ["codeBook", "CBS Code Book"],
      ["dictionary", "CBS Dictionary"],
    ] as const) {
      const { ws } = await roundTrip(ROWS, { ...META, view });
      expect(ws.name).toBe(sheet);
    }
  });

  it("writes a header-only sheet when the filter matched nothing", async () => {
    // An empty export is a legitimate outcome of a narrow filter; it must
    // still open rather than produce a corrupt file.
    const { ws } = await roundTrip([], {
      ...META,
      availableRows: 0,
      filterNote: "Filtered: matching “nothing”",
    });
    expect(ws.getRow(3).getCell(1).value).toBe("Display Code");
    expect(ws.actualRowCount).toBe(3);
  });

  it("clamps grouping at Excel's maximum outline depth", async () => {
    // Excel refuses outline levels past 7 and the file would not open.
    const deep = ROWS.map((r) => ({ ...r, outlineLevel: 12 }));
    const { ws } = await roundTrip(deep);
    expect(ws.getRow(FIRST_DATA_ROW).outlineLevel).toBe(7);
  });
});

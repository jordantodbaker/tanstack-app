import ExcelJS from "exceljs";
import {
  CBS_EXPORT_COLUMNS,
  CBS_EXPORT_LABELS,
  type CbsExportRow,
  type CbsExportView,
} from "~/lib/cbs-export";
import { CBS_HEADER_COLOR, cbsColorForLevel } from "~/config/cbs-level-colors";

/**
 * Builds the CBS export workbook.
 *
 * Server-only (`.server.ts`, so the client-leak check skips it and the Start
 * plugin keeps it out of the browser graph): exceljs is ~1 MB and the browser
 * has no reason to carry it for a button most sessions never press.
 *
 * The sheet mirrors the page deliberately — same per-level fills from
 * `~/config/cbs-level-colors`, same muted treatment for context rows, and the
 * tree depth as Excel row grouping, so the file opens collapsible rather than
 * as a flat dump.
 */

/** exceljs wants ARGB with no "#"; our palette is "#RRGGBB". */
function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

/** Excel's hard cap on outline depth; deeper rows group at the limit. */
const MAX_OUTLINE_LEVEL = 7;

export type CbsWorkbookMeta = {
  view: CbsExportView;
  /** Shown in the title row — which project, or that none was applied. */
  scope: string;
  /** Human description of the filters in force, "" when none. */
  filterNote: string;
  /** Rows the user can actually use (context rows excluded). */
  availableRows: number;
};

export async function buildCbsWorkbook(
  rows: readonly CbsExportRow[],
  meta: CbsWorkbookMeta,
): Promise<Buffer> {
  const labels = CBS_EXPORT_LABELS[meta.view];
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(labels.sheet, {
    properties: { outlineLevelRow: 0 },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Our hierarchy puts the summary row ABOVE its children, which is the
  // opposite of Excel's default — without this the +/- controls attach to the
  // wrong row and collapsing hides the parent instead of the children.
  ws.properties.outlineProperties = {
    summaryBelow: false,
    summaryRight: false,
  };

  // ── Title block ──────────────────────────────────────────────────────────
  const title = ws.addRow([labels.sheet]);
  title.font = { bold: true, size: 14 };
  ws.mergeCells(title.number, 1, title.number, CBS_EXPORT_COLUMNS.length);

  const subtitleParts = [meta.scope, `${meta.availableRows} codes`];
  if (meta.filterNote) subtitleParts.push(meta.filterNote);
  const subtitle = ws.addRow([subtitleParts.join(" · ")]);
  subtitle.font = { size: 10, italic: true, color: { argb: "FF64748B" } };
  ws.mergeCells(subtitle.number, 1, subtitle.number, CBS_EXPORT_COLUMNS.length);

  // ── Header ───────────────────────────────────────────────────────────────
  const header = ws.addRow(CBS_EXPORT_COLUMNS.map((c) => c.header));
  header.font = { bold: true, color: { argb: argb(CBS_HEADER_COLOR.text) } };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(CBS_HEADER_COLOR.fill) },
    };
    cell.alignment = { vertical: "middle" };
  });
  CBS_EXPORT_COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  // Filter on the header row so a recipient can slice it further themselves.
  ws.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: CBS_EXPORT_COLUMNS.length },
  };

  // ── Rows ─────────────────────────────────────────────────────────────────
  for (const row of rows) {
    const excelRow = ws.addRow(CBS_EXPORT_COLUMNS.map((c) => c.get(row)));
    excelRow.outlineLevel = Math.min(row.outlineLevel, MAX_OUTLINE_LEVEL);

    const colour = cbsColorForLevel(row.level);
    excelRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: argb(colour.fill) },
      };
      cell.font = {
        color: { argb: argb(colour.text) },
        // Context rows read as muted on the page; italic is the closest
        // equivalent that survives a cell already carrying a level fill.
        italic: row.context,
        bold: row.level <= 1 && !row.context,
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FF000000" } },
      };
    });
    // Codes are identifiers, not numbers — left-aligned and never reformatted
    // by Excel (it would strip the leading zeros of "052-…").
    excelRow.getCell(1).alignment = { horizontal: "left" };
    excelRow.getCell(1).numFmt = "@";
  }

  // exceljs types `writeBuffer` as its own Buffer-alike; the Node Buffer is
  // what the server fn base64-encodes.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

import ExcelJS from "exceljs";
import { CBS_HEADER_COLOR } from "~/config/cbs-level-colors";
import type { HealthCheck } from "~/lib/cbs-health";

/**
 * SERVER-ONLY. One health check's findings as an .xlsx.
 *
 * Deliberately not the CBS tree workbook: this is a worklist, not a hierarchy.
 * Someone takes it into Excel, sorts by code, and works down it — so it is a
 * flat table with a filter on, and the check's own summary and remedy written
 * above it so the file still explains itself once it has been forwarded.
 */

/** Row 1 is the title; the table header sits here. */
const HEADER_ROW = 6;

export async function buildHealthCheckWorkbook(
  check: HealthCheck,
  generatedAt: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(generatedAt);
  // Excel refuses \ / ? * [ ] in a sheet name and caps it at 31 characters.
  const sheetName = check.title.replace(/[\\/?*[\]]/g, " ").slice(0, 31);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });

  ws.getRow(1).getCell(1).value = check.title;
  ws.getRow(1).getCell(1).font = { bold: true, size: 14 };
  const meta: [string, string][] = [
    ["Severity", check.severity],
    ["Rows affected", check.count.toLocaleString()],
    ["What it means", check.summary],
    ["What to do", check.action],
  ];
  meta.forEach(([label, value], i) => {
    const row = ws.getRow(2 + i);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
  });

  const header = ws.getRow(HEADER_ROW);
  // Master Row first: the file is a worklist, sorted into spreadsheet order.
  ["Row", "Display Code", "Name", "Issue"].forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: `FF${CBS_HEADER_COLOR.fill.replace("#", "").toUpperCase()}`,
      },
    };
    cell.font = {
      bold: true,
      color: {
        argb: `FF${CBS_HEADER_COLOR.text.replace("#", "").toUpperCase()}`,
      },
    };
  });

  check.findings.forEach((finding, i) => {
    const row = ws.getRow(HEADER_ROW + 1 + i);
    // A real number, so Excel sorts it as one rather than as text.
    if (finding.originalRow != null) row.getCell(1).value = finding.originalRow;
    const code = row.getCell(2);
    code.value = finding.code;
    // Text, or Excel eats the leading zero on "052-15-...".
    code.numFmt = "@";
    row.getCell(3).value = finding.name;
    row.getCell(4).value = finding.detail;
  });

  if (check.findings.length > 0) {
    ws.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW + check.findings.length, column: 4 },
    };
  }
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 46;
  ws.getColumn(4).width = 80;

  // exceljs types `writeBuffer` as its own Buffer-alike; the Node Buffer is
  // what the server fn base64-encodes.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A filename that says which check and when, since these get forwarded. */
export function healthCheckFilename(check: HealthCheck, when: string): string {
  const slug = check.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `cbs-health-${slug}-${when.slice(0, 10)}.xlsx`;
}

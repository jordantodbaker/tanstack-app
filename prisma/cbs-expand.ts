/**
 * Expanding the condensed CBS master into the workbook the loader reads.
 *
 * The master (`CBS.master.xlsx`) has one row per account, four-segment codes
 * and a YES/NO flag per cost type. The loader, CBS Health and `cbs:import`
 * want the expanded dictionary: a "-0" roll-up row per account plus one typed
 * row per flag that is YES. The rules are `planCbsWorkbookExpansion` in
 * `src/lib/cbs-workbook-expand.ts`; this is the Excel around them — reading
 * the master through the shared sheet reader and writing the result — kept
 * out of the script so a test can run the whole round trip on a temp file.
 * `scripts/expand-cbs-workbook.ts` is the command-line shell.
 */
import ExcelJS from "exceljs";
import { existsSync, statSync } from "node:fs";
import {
  CBS_MASTER_PATH,
  CBS_WORKBOOK_PATH,
  openCbsSheet,
  plainCellValue,
} from "./cbs-sheet";
import {
  planCbsWorkbookExpansion,
  type CellValue,
  type ExpansionPlan,
  type MasterRow,
} from "../src/lib/cbs-workbook-expand";

/** The output's sheet name — the one the loader looks for after "CBS". */
export const CBS_EXPANDED_SHEET = "CBS Expanded";

export type CbsMaster = {
  path: string;
  sheet: string;
  /** Headers in column order; a blank header cell is skipped. */
  headers: string[];
  rows: MasterRow[];
  /** Column widths by header position, carried onto the output. */
  widths: (number | undefined)[];
};

/** The master's rows as header-to-value maps, typed values kept. */
export async function readCbsMaster(
  path: string = CBS_MASTER_PATH,
): Promise<CbsMaster> {
  const sheet = await openCbsSheet(path);
  const { ws, headerRow } = sheet;
  const columns = Object.entries(sheet.column).sort((a, b) => a[1] - b[1]);
  const headers = columns.map(([h]) => h);
  const rows: MasterRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: Record<string, CellValue> = {};
    for (const [h, n] of columns) {
      cells[h] = plainCellValue(row.getCell(n).value);
    }
    rows.push({ row: r, cells });
  }
  const widths = columns.map(([, n]) => ws.getColumn(n).width);
  return { path, sheet: ws.name, headers, rows, widths };
}

/** Writes the plan's rows as the expanded workbook; returns the byte size. */
export async function writeCbsExpanded(
  path: string,
  plan: ExpansionPlan,
  widths: (number | undefined)[] = [],
): Promise<number> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(CBS_EXPANDED_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = plan.headers.map((header, i) => ({
    header,
    key: header,
    width: widths[i] ?? (header.length > 12 ? 18 : 12),
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of plan.rows) {
    ws.addRow(
      plan.headers.map((h) => (r.cells[h] === null ? undefined : r.cells[h])),
    );
  }
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: plan.headers.length },
  };
  await wb.xlsx.writeFile(path);
  return statSync(path).size;
}

export type CbsExpandResult = {
  master: CbsMaster;
  plan: ExpansionPlan;
  /** Bytes written, or null when nothing was: a dry run, or a plan with problems. */
  bytes: number | null;
};

/**
 * The whole job: read the master, plan, and write the expanded workbook —
 * unless the plan has problems (the file is already expanded, a code is
 * malformed, a code is duplicated…), in which case nothing is written and the
 * problems come back for the caller to report.
 */
export async function expandCbsWorkbook({
  inPath = CBS_MASTER_PATH,
  outPath = CBS_WORKBOOK_PATH,
  write = true,
}: {
  inPath?: string;
  outPath?: string;
  /** False for a dry run: plan only. */
  write?: boolean;
} = {}): Promise<CbsExpandResult> {
  if (!existsSync(inPath)) {
    throw new Error(
      `${inPath}: not found. The condensed master belongs there (or pass --in <path>).`,
    );
  }
  const master = await readCbsMaster(inPath);
  const plan = planCbsWorkbookExpansion(master.headers, master.rows);
  if (plan.problems.length > 0 || !write) return { master, plan, bytes: null };
  const bytes = await writeCbsExpanded(outPath, plan, master.widths);
  return { master, plan, bytes };
}

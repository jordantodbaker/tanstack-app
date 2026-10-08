/**
 * Loads the CBS workbook (`prisma/data/CBS.xlsx`) and expands it
 * into the CBS Dictionary the app stores in `CbsItem`:
 *
 *   - every workbook row ("ORIGINAL"), plus
 *   - for each row with Sub Code = YES, a "SUB" twin whose cost type (the
 *     trailing code segment, L7 in the workbook) is `S`, and
 *   - for each row with Material Code = YES, a "MATERIAL" twin with type `M`.
 *
 * A twin is skipped when the workbook already carries that code. Generated
 * rows copy the original, suffix the name ("… Subcontracts" / "… Materials"),
 * set the G/L (5200 / 5100) and record `generatedFrom` — the same shape as
 * the "CBS S-M Generated" dictionary sheet.
 *
 * The workbook's own L1–L7 helper columns and outline levels are NOT trusted
 * (they disagree with the Display Code in ~1,100 rows); every level segment is
 * derived from the Display Code `XXX-YY-ZZWW-VV-T`, and the cost code is the
 * display code without hyphens. Duplicate display codes keep the first named
 * occurrence and are reported.
 *
 * Shared by the seed (`prisma/seed.ts`) and the live-DB re-import
 * (`scripts/import-cbs.ts`).
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import {
  compareCbsDisplayCodes,
  parseCbsDisplayCode,
} from "../src/lib/cbs-tree";
import {
  expandCbsDictionary,
  type CbsDictionaryRow,
} from "../src/lib/cbs-dictionary";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CBS_WORKBOOK_PATH = join(__dirname, "data", "CBS.xlsx");

export type { CbsRowType, CbsDictionaryRow } from "../src/lib/cbs-dictionary";

export type CbsWorkbookReport = {
  source: string;
  sheet: string;
  /** Non-empty workbook rows read (before de-duplication). */
  sheetRows: number;
  originals: number;
  generatedSub: number;
  generatedMaterial: number;
  skippedExistingSub: number;
  skippedExistingMaterial: number;
  /** Rows whose "Cost Code" cell disagreed with the Display Code (derived wins). */
  costCodeMismatches: number;
  /**
   * Rows whose L1–L7 helper columns disagree with the Display Code, grouped by
   * the move they imply. The Display Code is the account's identity — the app
   * stores it on every estimate row — so renumbering only the helper columns
   * does nothing, and usually leaves the row colliding with whatever still owns
   * the old code. Surfaced per import because that mistake is invisible
   * otherwise.
   */
  segmentMismatches: {
    /** The division (L1) the helper columns claim. */
    columnsL1: string;
    /** The division the Display Code actually puts the row in. */
    codeL1: string;
    rows: number;
    sample: { row: number; name: string };
  }[];
  duplicates: { row: number; displayCode: string; name: string; kept: boolean }[];
  invalid: { row: number; displayCode: string; name: string; reason: string }[];
};

/** Sheet names to look for, in order, before falling back to the first. */
const SHEET_NAMES = ["CBS", "Master CBS"] as const;

const DISPLAY_CODE_RE = /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}-[0-9A-Z]$/;


/**
 * ExcelJS throws on the `colorFilter` autofilter nodes inside Excel Tables.
 * Strip the table parts in memory — only cell values are needed. A no-op for
 * workbooks without tables.
 */
function stripTables(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const out: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith("xl/tables/")) continue;
    if (path.startsWith("xl/worksheets/") && path.endsWith(".xml")) {
      out[path] = strToU8(
        strFromU8(data).replace(/<tableParts[^>]*>[\s\S]*?<\/tableParts>/g, ""),
      );
    } else if (path.includes("/worksheets/_rels/") && path.endsWith(".rels")) {
      out[path] = strToU8(
        strFromU8(data).replace(
          /<Relationship[^>]*relationships\/table[^>]*\/>/g,
          "",
        ),
      );
    } else if (path === "[Content_Types].xml") {
      out[path] = strToU8(
        strFromU8(data).replace(
          /<Override[^>]*spreadsheetml\.table\+xml[^>]*\/>/g,
          "",
        ),
      );
    } else {
      out[path] = data;
    }
  }
  return zipSync(out);
}

function toBool(v: string): boolean | null {
  const t = v.trim().toUpperCase();
  if (t === "YES" || t === "Y" || t === "TRUE") return true;
  if (t === "NO" || t === "N" || t === "FALSE") return false;
  return null;
}

export async function loadCbsWorkbook(
  path: string = CBS_WORKBOOK_PATH,
): Promise<{ items: CbsDictionaryRow[]; report: CbsWorkbookReport }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(stripTables(readFileSync(path))) as never);
  // Prefer a sheet named for the CBS, but fall back to the first one so a
  // renamed tab does not break the import — the header scan below is what
  // actually validates that we are reading the right thing.
  const ws =
    SHEET_NAMES.map((n) => wb.getWorksheet(n)).find(Boolean) ??
    wb.worksheets[0];
  if (!ws) throw new Error(`${path}: workbook has no sheets`);

  // The header row is wherever "Display Code" appears (row 1 in the CBS sheet,
  // row 4 in the dictionary-style sheets that carry a title block).
  let headerRow = 0;
  const headers: string[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
    const found: string[] = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      found[col] = (cell.text ?? "").trim();
    });
    if (found.includes("Display Code")) {
      headerRow = r;
      headers.push(...found);
    }
  }
  if (!headerRow) {
    throw new Error(`${path} [${ws.name}]: no header row with "Display Code"`);
  }
  const col = (label: string): number => {
    const exact = headers.indexOf(label);
    if (exact >= 0) return exact;
    return headers.findIndex((h) => h && h.startsWith(label));
  };
  const required = ["Display Code", "Name"] as const;
  for (const label of required) {
    if (col(label) < 0) {
      throw new Error(`${path} [${ws.name}]: missing "${label}" column`);
    }
  }

  const report: CbsWorkbookReport = {
    source: path,
    sheet: ws.name,
    sheetRows: 0,
    originals: 0,
    generatedSub: 0,
    generatedMaterial: 0,
    skippedExistingSub: 0,
    skippedExistingMaterial: 0,
    costCodeMismatches: 0,
    segmentMismatches: [],
    duplicates: [],
    invalid: [],
  };

  // Keyed "columns→code" so a whole renumbered block collapses to one line.
  const segmentMismatches = new Map<
    string,
    CbsWorkbookReport["segmentMismatches"][number]
  >();
  const byCode = new Map<string, CbsDictionaryRow>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const text = (label: string): string => {
      const c = col(label);
      return c > 0 ? (row.getCell(c).text ?? "").toString().trim() : "";
    };
    const or = (label: string): string | null => text(label) || null;

    const displayCode = text("Display Code").toUpperCase();
    const name = text("Name");
    if (!displayCode && !name) continue;
    report.sheetRows++;

    if (!DISPLAY_CODE_RE.test(displayCode)) {
      report.invalid.push({
        row: r,
        displayCode,
        name,
        reason: displayCode
          ? "display code is not XXX-XX-XXXX-XX-X"
          : "missing display code",
      });
      continue;
    }

    const costCode = displayCode.replace(/-/g, "");
    const sheetCostCode = text("Cost Code");
    if (sheetCostCode && sheetCostCode !== costCode) report.costCodeMismatches++;

    // The sheet splits the code across L1–L7 (L1 holds the first two digits of
    // the division, L2 the third). Compare the whole thing against the code we
    // actually use, so a partial renumber is reported rather than ignored.
    const segments = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"].map(text);
    if (segments.every((seg) => seg !== "")) {
      const fromColumns = segments.join("").toUpperCase();
      if (fromColumns !== costCode) {
        // Group by the DIVISION move, so a renumbered block of forty rows
        // reads as one line instead of forty.
        const columnsL1 = (segments[0] + segments[1]).toUpperCase();
        const codeL1 = displayCode.slice(0, 3);
        const key = `${columnsL1}>${codeL1}`;
        const hit = segmentMismatches.get(key);
        if (hit) hit.rows++;
        else
          segmentMismatches.set(key, {
            columnsL1,
            codeL1,
            rows: 1,
            sample: { row: r, name },
          });
      }
    }

    const item: CbsDictionaryRow = {
      ...parseCbsDisplayCode(displayCode),
      name,
      displayCode,
      uom: text("UOM"),
      subReporting: toBool(text("Sub Code")),
      materialCode: toBool(text("Material Code")),
      materialType: or("Material Type"),
      costCenter: or("Cost Center"),
      costClassification: or("Cost Classification"),
      status: or("Status"),
      accountDescription: text("Account Description"),
      l2Description: or("L2 Description"),
      core: or("Core"),
      coreExtension: or("Core Extension"),
      wbs: or("WBS"),
      p6CostAccount: or("P6 Cost Account"),
      gl: or("G/L"),
      discipline: or("Discipline"),
      costCode,
      description: or("Description"),
      notes: or("Notes"),
      displayDescription: `${displayCode}:  ${name}`,
      rowType: "ORIGINAL",
      generatedFrom: null,
    };

    const prior = byCode.get(displayCode);
    if (prior) {
      // Keep the first occurrence, unless it has no name and this one does.
      const replace = !prior.name && !!name;
      report.duplicates.push({ row: r, displayCode, name, kept: replace });
      if (replace) byCode.set(displayCode, item);
      continue;
    }
    byCode.set(displayCode, item);
  }

  report.segmentMismatches = [...segmentMismatches.values()];

  const originals = [...byCode.values()].sort((a, b) =>
    compareCbsDisplayCodes(a.displayCode, b.displayCode),
  );
  report.originals = originals.length;

  const expanded = expandCbsDictionary(originals);
  report.generatedSub = expanded.generatedSub;
  report.generatedMaterial = expanded.generatedMaterial;
  report.skippedExistingSub = expanded.skippedExistingSub;
  report.skippedExistingMaterial = expanded.skippedExistingMaterial;

  // Final order follows the hierarchy (parents before children, S/M twins
  // right after their original) so ascending ids read like the dictionary.
  const items = expanded.items.sort((a, b) =>
    compareCbsDisplayCodes(a.displayCode, b.displayCode),
  );
  return { items, report };
}

export function formatCbsWorkbookReport(report: CbsWorkbookReport): string {
  const lines = [
    `Master CBS: ${report.source} [${report.sheet}]`,
    `  workbook rows ${report.sheetRows} → originals ${report.originals}` +
      ` (+${report.generatedSub} generated S, +${report.generatedMaterial} generated M;` +
      ` skipped ${report.skippedExistingSub} S / ${report.skippedExistingMaterial} M already present)`,
    `  dictionary total: ${report.originals + report.generatedSub + report.generatedMaterial}`,
  ];
  if (report.costCodeMismatches) {
    lines.push(
      `  ${report.costCodeMismatches} row(s) had a Cost Code cell that disagreed with the Display Code (derived from Display Code).`,
    );
  }
  if (report.segmentMismatches.length) {
    const rows = report.segmentMismatches.reduce((n, m) => n + m.rows, 0);
    lines.push(
      `  ${rows} row(s) whose L1–L7 columns disagree with their Display Code.`,
      "  The Display Code is the account's identity — renumbering only the L1–L7",
      "  columns has NO effect, and usually collides with whatever still owns the",
      "  old code. Edit the Display Code (and Cost Code) to complete the move:",
    );
    for (const m of report.segmentMismatches) {
      lines.push(
        `    L1 columns say ${m.columnsL1}, Display Codes say ${m.codeL1}` +
          ` — ${m.rows} row(s), e.g. row ${m.sample.row} "${m.sample.name}"`,
      );
    }
  }
  if (report.duplicates.length) {
    lines.push(`  ${report.duplicates.length} duplicate display code(s) in the workbook:`);
    for (const d of report.duplicates) {
      lines.push(
        `    row ${d.row}: ${d.displayCode} "${d.name}" ${d.kept ? "(kept — earlier row had no name)" : "(dropped)"}`,
      );
    }
  }
  if (report.invalid.length) {
    lines.push(`  ${report.invalid.length} row(s) skipped as invalid:`);
    for (const i of report.invalid) {
      lines.push(`    row ${i.row}: "${i.displayCode}" "${i.name}" — ${i.reason}`);
    }
  }
  return lines.join("\n");
}

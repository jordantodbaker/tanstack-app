/**
 * Loads the Master CBS workbook (`prisma/data/MasterCBS.xlsx`) and expands it
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
 * (`scripts/import-master-cbs.ts`).
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { compareCbsDisplayCodes } from "../src/lib/cbs-tree";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MASTER_CBS_PATH = join(__dirname, "data", "MasterCBS.xlsx");

/** Mirrors the Prisma `CbsRowType` enum. */
export type CbsRowType = "ORIGINAL" | "SUB" | "MATERIAL";

export type MasterCbsItem = {
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  l6: string;
  name: string;
  displayCode: string;
  uom: string;
  subReporting: boolean | null;
  materialCode: boolean | null;
  materialType: string | null;
  costCenter: string | null;
  costClassification: string | null;
  status: string | null;
  accountDescription: string;
  l2Description: string | null;
  core: string | null;
  coreExtension: string | null;
  wbs: string | null;
  p6CostAccount: string | null;
  gl: string | null;
  discipline: string | null;
  costCode: string;
  description: string | null;
  notes: string | null;
  displayDescription: string;
  rowType: CbsRowType;
  generatedFrom: string | null;
};

export type MasterCbsReport = {
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
  duplicates: { row: number; displayCode: string; name: string; kept: boolean }[];
  invalid: { row: number; displayCode: string; name: string; reason: string }[];
};

const DISPLAY_CODE_RE = /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}-[0-9A-Z]$/;

const SUB_GL = "5200";
const MATERIAL_GL = "5100";

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

/** "Civil" + "Materials" → "Civil Materials"; "Shop Materials" stays as is. */
function suffixName(name: string, suffix: string): string {
  const base = name.trim();
  if (!base) return suffix;
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) return base;
  return `${base} ${suffix}`;
}

function segmentsOf(displayCode: string) {
  return {
    l1: displayCode.slice(0, 3),
    l2: displayCode.slice(4, 6),
    l3: displayCode.slice(7, 9),
    l4: displayCode.slice(9, 11),
    l5: displayCode.slice(12, 14),
    l6: displayCode.slice(15, 16),
  };
}

/** Swap the trailing cost-type segment: "601-05-0000-00-0" + "S" → "…-S". */
export function withCostType(displayCode: string, type: string): string {
  return `${displayCode.slice(0, 15)}${type}`;
}

function generateTwin(
  original: MasterCbsItem,
  type: "S" | "M",
): MasterCbsItem {
  const displayCode = withCostType(original.displayCode, type);
  const name = suffixName(
    original.name,
    type === "S" ? "Subcontracts" : "Materials",
  );
  return {
    ...original,
    ...segmentsOf(displayCode),
    name,
    displayCode,
    costCode: displayCode.replace(/-/g, ""),
    gl: type === "S" ? SUB_GL : MATERIAL_GL,
    displayDescription: `${displayCode}:  ${name}`,
    rowType: type === "S" ? "SUB" : "MATERIAL",
    generatedFrom: original.displayCode,
  };
}

/**
 * Expands original rows into the dictionary: each original is followed by its
 * generated S and M twins (skipped when that code already exists). Exported so
 * the generation rule can be unit-tested without a workbook.
 */
export function expandCbsDictionary(originals: MasterCbsItem[]): {
  items: MasterCbsItem[];
  generatedSub: number;
  generatedMaterial: number;
  skippedExistingSub: number;
  skippedExistingMaterial: number;
} {
  const existing = new Set(originals.map((o) => o.displayCode));
  const items: MasterCbsItem[] = [];
  const stats = {
    generatedSub: 0,
    generatedMaterial: 0,
    skippedExistingSub: 0,
    skippedExistingMaterial: 0,
  };
  for (const o of originals) {
    items.push(o);
    if (o.subReporting === true) {
      const twin = generateTwin(o, "S");
      if (existing.has(twin.displayCode)) stats.skippedExistingSub++;
      else {
        existing.add(twin.displayCode);
        items.push(twin);
        stats.generatedSub++;
      }
    }
    if (o.materialCode === true) {
      const twin = generateTwin(o, "M");
      if (existing.has(twin.displayCode)) stats.skippedExistingMaterial++;
      else {
        existing.add(twin.displayCode);
        items.push(twin);
        stats.generatedMaterial++;
      }
    }
  }
  return { items, ...stats };
}

export async function loadMasterCbs(
  path: string = MASTER_CBS_PATH,
): Promise<{ items: MasterCbsItem[]; report: MasterCbsReport }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(stripTables(readFileSync(path))) as never);
  const ws = wb.getWorksheet("Master CBS") ?? wb.worksheets[0];
  if (!ws) throw new Error(`${path}: workbook has no sheets`);

  // The header row is wherever "Display Code" appears (row 1 in the master,
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

  const report: MasterCbsReport = {
    source: path,
    sheet: ws.name,
    sheetRows: 0,
    originals: 0,
    generatedSub: 0,
    generatedMaterial: 0,
    skippedExistingSub: 0,
    skippedExistingMaterial: 0,
    costCodeMismatches: 0,
    duplicates: [],
    invalid: [],
  };

  const byCode = new Map<string, MasterCbsItem>();
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

    const item: MasterCbsItem = {
      ...segmentsOf(displayCode),
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

export function formatMasterCbsReport(report: MasterCbsReport): string {
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

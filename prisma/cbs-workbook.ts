/**
 * Loads the CBS workbook (`prisma/data/CBS.xlsx`) into the CBS Dictionary the
 * app stores in `CbsItem`: one item per sheet row.
 *
 * The sheet is the expanded one `cbs:expand` writes from the condensed master
 * — a "-0" roll-up row per account plus a typed line per cost type the account
 * carries — so nothing is generated here. (The loader used to add S / M twins
 * for accounts flagged Sub Code / Material Code; the expand script owns every
 * cost type now, with one set of rules in `src/lib/cbs-workbook-expand.ts`.)
 * What the loader does to every row is validate the code, normalize a
 * four-segment summary code to the "-0" backbone, and derive the levels.
 *
 * The workbook's own L1–L6 helper columns and outline levels are NOT trusted
 * (they disagree with the Display Code in ~1,100 rows); every level segment is
 * derived from the Display Code `XXX-YY-ZZWW-VV-T`, and the cost code is the
 * display code without hyphens. Duplicate display codes keep the first named
 * occurrence and are reported.
 *
 * Shared by the seed (`prisma/seed.ts`) and the live-DB re-import
 * (`scripts/import-cbs.ts`).
 */
import { statSync } from "node:fs";
import {
  compareCbsDisplayCodes,
  parseCbsDisplayCode,
} from "../src/lib/cbs-tree";
import type { CbsDictionaryRow } from "../src/lib/cbs-dictionary";
import { CBS_WORKBOOK_PATH, openCbsSheet } from "./cbs-sheet";

export type { CbsDictionaryRow } from "../src/lib/cbs-dictionary";
export { CBS_WORKBOOK_PATH, CBS_MASTER_PATH, SHEET_NAMES } from "./cbs-sheet";

export type CbsWorkbookReport = {
  source: string;
  sheet: string;
  /** Non-empty workbook rows read (before de-duplication). */
  sheetRows: number;
  /** Distinct, valid rows loaded — the dictionary's size. */
  originals: number;
  /** Rows whose "Cost Code" cell disagreed with the Display Code (derived wins). */
  costCodeMismatches: number;
  /**
   * Rows whose L1–L6 helper columns disagree with the Display Code, grouped by
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
  duplicates: {
    row: number;
    displayCode: string;
    name: string;
    kept: boolean;
  }[];
  invalid: { row: number; displayCode: string; name: string; reason: string }[];
};

const DISPLAY_CODE_RE =
  /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}-[0-9A-Z]$/;

/** A summary code with no cost-type segment: 012-05-0000-00. */
const SUMMARY_CODE_RE = /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}$/;

/**
 * The workbook writes a summary row without a cost type and marks it "(*)" in
 * the name; everything downstream — the tree, the color-by-level scheme, the
 * ancestor walk — is built on the five-segment form where "0" IS the summary
 * cost type. Normalizing here keeps that single code shape, so nothing below
 * the loader has to learn a second one.
 */
function normalizeDisplayCode(raw: string): string {
  return SUMMARY_CODE_RE.test(raw) ? `${raw}-${BACKBONE_COST_TYPE}` : raw;
}

/** The cost type a summary row carries once normalized. */
const BACKBONE_COST_TYPE = "0";

function toBool(v: string): boolean | null {
  const t = v.trim().toUpperCase();
  if (t === "YES" || t === "Y" || t === "TRUE") return true;
  if (t === "NO" || t === "N" || t === "FALSE") return false;
  return null;
}

export type CbsWorkbookLoad = {
  items: CbsDictionaryRow[];
  report: CbsWorkbookReport;
};

/** Keyed on the file's identity, not its path — see `loadCbsWorkbookCached`. */
let workbookCache: {
  path: string;
  mtimeMs: number;
  size: number;
  load: CbsWorkbookLoad;
} | null = null;

/**
 * `loadCbsWorkbook`, but reusing the last parse when the file has not changed.
 *
 * Parsing the 1.3 MB workbook costs ~2.5 seconds and is the single biggest
 * stage of the CBS Health report, which re-reads it on every build. The
 * contents only change when someone saves CBS.xlsx, so the cache is keyed on
 * the file's modification time AND size: this workbook gets replaced often,
 * and a cache keyed on the path alone would serve the old one.
 *
 * Deliberately a separate function. `loadCbsWorkbook` stays an honest read —
 * the import must never act on a stale parse, and the tests write a fresh
 * workbook to a temp path for each case.
 *
 * The returned object is shared between callers, so treat it as read-only.
 */
export async function loadCbsWorkbookCached(
  path: string = CBS_WORKBOOK_PATH,
): Promise<CbsWorkbookLoad> {
  const { mtimeMs, size } = statSync(path);
  if (
    workbookCache &&
    workbookCache.path === path &&
    workbookCache.mtimeMs === mtimeMs &&
    workbookCache.size === size
  ) {
    return workbookCache.load;
  }
  const load = await loadCbsWorkbook(path);
  workbookCache = { path, mtimeMs, size, load };
  return load;
}

export async function loadCbsWorkbook(
  path: string = CBS_WORKBOOK_PATH,
): Promise<{ items: CbsDictionaryRow[]; report: CbsWorkbookReport }> {
  // Which sheet, where the header row is, how a column is matched: see
  // `openCbsSheet`. Only "Display Code" and "Name" are required; every other
  // column is read when present and null when not.
  const sheet = await openCbsSheet(path);
  const { ws, headerRow, col } = sheet;
  for (const label of ["Display Code", "Name"] as const) {
    if (!col(label)) {
      throw new Error(`${path} [${ws.name}]: missing "${label}" column`);
    }
  }

  const report: CbsWorkbookReport = {
    source: path,
    sheet: ws.name,
    sheetRows: 0,
    originals: 0,
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
    /** A whole-number cell, or null when it is blank or not a number. */
    const number = (label: string): number | null => {
      const raw = text(label);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };

    const displayCode = normalizeDisplayCode(
      text("Display Code").toUpperCase(),
    );
    // Kept as written, cost-type marker and all ("Executive (L)"): the
    // dictionary shows which cost type each line is. The Cost Accounts list,
    // which has badges for that, strips it on display.
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
    if (sheetCostCode && sheetCostCode !== costCode)
      report.costCodeMismatches++;

    // The sheet splits the code across L1–L6 (L1 holds the first two digits of
    // the division, L2 the third); the cost type has no column of its own.
    // Compare them against the code we actually use, less its cost type, so a
    // partial renumber is reported rather than ignored.
    const segments = ["L1", "L2", "L3", "L4", "L5", "L6"].map(text);
    if (segments.every((seg) => seg !== "")) {
      const fromColumns = segments.join("").toUpperCase();
      if (fromColumns !== costCode.slice(0, -1)) {
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
      laborCode: toBool(text("Labor Code")),
      equipmentCode: toBool(text("Equipment Code")),
      otherCode: toBool(text("Other Code")),
      rentalCode: toBool(text("Rental Code")),
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
      // "Original Row" was "Master Row" and before that "Master CBS Row"; read
      // any of them so an older copy of the workbook still traces. The current
      // workbook reuses the header for a TRUE / FALSE flag instead (below), so
      // `number` finds nothing there and this is null.
      originalRow:
        number("Original Row") ??
        number("Master Row") ??
        number("Master CBS Row"),
      expandedRow: number("Expanded Row"),
      // TRUE for an original row, FALSE for a generated cost-type line. Null
      // when the column holds a row number (an older workbook) or is absent.
      isOriginal: toBool(text("Original Row")),
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

  // Hierarchy order — parents before children, an account's typed lines
  // right after its roll-up — so ascending ids read like the dictionary.
  const items = [...byCode.values()].sort((a, b) =>
    compareCbsDisplayCodes(a.displayCode, b.displayCode),
  );
  report.originals = items.length;
  return { items, report };
}

export function formatCbsWorkbookReport(report: CbsWorkbookReport): string {
  const lines = [
    `Master CBS: ${report.source} [${report.sheet}]`,
    `  workbook rows ${report.sheetRows} → dictionary rows ${report.originals}`,
  ];
  if (report.costCodeMismatches) {
    lines.push(
      `  ${report.costCodeMismatches} row(s) had a Cost Code cell that disagreed with the Display Code (derived from Display Code).`,
    );
  }
  if (report.segmentMismatches.length) {
    const rows = report.segmentMismatches.reduce((n, m) => n + m.rows, 0);
    lines.push(
      `  ${rows} row(s) whose L1–L6 columns disagree with their Display Code.`,
      "  The Display Code is the account's identity — renumbering only the L1–L6",
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
    lines.push(
      `  ${report.duplicates.length} duplicate display code(s) in the workbook:`,
    );
    for (const d of report.duplicates) {
      lines.push(
        `    row ${d.row}: ${d.displayCode} "${d.name}" ${d.kept ? "(kept — earlier row had no name)" : "(dropped)"}`,
      );
    }
  }
  if (report.invalid.length) {
    lines.push(`  ${report.invalid.length} row(s) skipped as invalid:`);
    for (const i of report.invalid) {
      lines.push(
        `    row ${i.row}: "${i.displayCode}" "${i.name}" — ${i.reason}`,
      );
    }
  }
  return lines.join("\n");
}

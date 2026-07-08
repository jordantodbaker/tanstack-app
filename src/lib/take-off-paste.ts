/**
 * Parse a block of spreadsheet cells (tab-separated, as produced by copying
 * from Excel / Google Sheets) into Take Off rows. Pure — no React/DOM — so the
 * mapping is unit-tested and the dialog stays a thin wrapper.
 *
 * Expected columns, in order (trailing columns optional):
 *
 *   CBS Code | Description | Quantity | Labor Factor | Labor Rate | Area |
 *   Role | Schedule | Notes
 *
 * A CBS Code is resolved against the discipline's catalog to fill the row's
 * name and unit; an unrecognized code is kept as-is (and reported so the UI can
 * warn). Labor Hours is derived (quantity × factor, factor defaulting to 1),
 * matching the grid's own computation, so pasted rows show a Total Cost as soon
 * as a rate is present.
 */
import type { CbsOption, FefRow } from "./types";
import { makeFefRow } from "./fef-helpers";
import { disciplineForL1 } from "~/utils/cvr-bucket";

/** Column headers, in the order the parser reads them. Shown in the dialog. */
export const TAKE_OFF_PASTE_COLUMNS = [
  "CBS Code",
  "Description",
  "Quantity",
  "Labor Factor",
  "Labor Rate",
  "Area",
  "Role",
  "Schedule",
  "Notes",
] as const;

/** Area lookup entry: the stored id (`value`) and its display label. Both are
 *  accepted when importing an Area cell. */
export type AreaMatchOption = { value: string; label: string };

export type ParsedTakeOffPaste = {
  rows: FefRow[];
  /** Pasted CBS codes that didn't match a catalog item (distinct, first-seen). */
  unmatchedCodes: string[];
};

const DEFAULT_LABOR_FACTOR = "1";

/** Strip thousands separators, currency symbols, and surrounding whitespace
 *  from a pasted numeric cell so "1,200" / "$45.00" compute correctly. Leaves
 *  the value as a string (the grid stores strings); non-numeric text is
 *  returned trimmed so the user still sees what they pasted. */
function cleanNumber(raw: string): string {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return cleaned === "" ? "" : cleaned;
}

/** quantity × (factor || 1), to 1dp; "" when either isn't a finite number. */
function computeLaborHours(quantity: string, factor: string): string {
  const q = parseFloat(quantity);
  const f = parseFloat(factor !== "" ? factor : DEFAULT_LABOR_FACTOR);
  if (!Number.isFinite(q) || !Number.isFinite(f)) return "";
  return (q * f).toFixed(1);
}

/** True when the first row looks like a pasted header rather than data. */
function isHeaderLine(cells: string[]): boolean {
  const first = (cells[0] ?? "").toLowerCase().replace(/\s+/g, "");
  return (
    first === "cbscode" || first === "code" || first === "cbs" || first === "id"
  );
}

/** Normalize a code for matching: drop hyphens/whitespace, lowercase. Lets a
 *  pasted code match whether it's the display code ("601-10-0000-00-L") or the
 *  cost code, with or without hyphens. */
function normalizeCode(code: string): string {
  return code.replace(/[-\s]/g, "").toLowerCase();
}

type RawPastedRow = {
  code: string;
  description: string;
  quantity: string;
  laborFactor: string;
  laborRate: string;
  area: string;
  role: string;
  schedule: string;
  notes: string;
};

/** Map an area cell (its id OR its label, case-insensitive) to the stored area
 *  id. Empty / unrecognized area cells resolve to "" (unassigned). */
function buildAreaResolver(areaOptions: AreaMatchOption[]): Map<string, string> {
  const map = new Map<string, string>();
  const norm = (s: string) => s.trim().toLowerCase();
  for (const o of areaOptions) {
    const idKey = norm(o.value);
    if (idKey && !map.has(idKey)) map.set(idKey, o.value);
    const labelKey = norm(o.label);
    if (labelKey && !map.has(labelKey)) map.set(labelKey, o.value);
  }
  return map;
}

/**
 * Split a raw block into rows of string cells, auto-detecting the delimiter and
 * honoring RFC 4180 double-quote quoting. Tabs win when present (a copy out of
 * Excel/Sheets), otherwise commas (a raw CSV file — e.g. this app's own Take Off
 * export), so both round-trip. A quoted field may contain the delimiter, quotes
 * (doubled), or newlines. A leading UTF-8 BOM (which our CSV download carries)
 * is stripped.
 */
function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delimiter = src.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush a trailing field/row when the block doesn't end in a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Split a pasted block into raw cell rows — skips blank lines and a leading
 *  header row, cleans numeric cells. No CBS resolution (that needs options). */
function tokenize(text: string): RawPastedRow[] {
  const rows: RawPastedRow[] = [];
  let sawFirst = false;

  for (const raw of parseDelimited(text)) {
    const cells = raw.map((c) => c.trim());
    if (cells.every((c) => c === "")) continue;

    // Skip a leading header row (Excel copies / CSV files include column titles).
    if (!sawFirst && isHeaderLine(cells)) {
      sawFirst = true;
      continue;
    }
    sawFirst = true;

    const code = cells[0] ?? "";
    const description = cells[1] ?? "";
    const quantity = cleanNumber(cells[2] ?? "");
    // Nothing meaningful on this line.
    if (code === "" && description === "" && quantity === "") continue;

    rows.push({
      code,
      description,
      quantity,
      laborFactor: cleanNumber(cells[3] ?? ""),
      laborRate: cleanNumber(cells[4] ?? ""),
      area: cells[5] ?? "",
      role: cells[6] ?? "",
      schedule: cells[7] ?? "",
      notes: cells[8] ?? "",
    });
  }

  return rows;
}

/** Distinct, non-empty CBS codes in a pasted block — what the dialog hands the
 *  server to resolve against the full catalog. */
export function extractTakeOffCodes(text: string): string[] {
  return [
    ...new Set(tokenize(text).map((r) => r.code).filter((c) => c !== "")),
  ];
}

export type SplitTakeOffRows = {
  /** Rows belonging to the current sheet (its discipline, or no resolvable
   *  discipline) — appended in place. */
  local: FefRow[];
  /** Off-discipline rows, grouped by the discipline id they belong to. */
  byDiscipline: Map<string, FefRow[]>;
};

/**
 * Partition pasted rows by the discipline their CBS code rolls up to. A row
 * whose code resolves to a *different* discipline than the open sheet is routed
 * to that discipline (so it lands on its own Take Off page); everything else —
 * same discipline, an unrecognized code, or no code — stays local.
 */
export function splitRowsByDiscipline(
  rows: FefRow[],
  currentDiscipline: string,
): SplitTakeOffRows {
  const local: FefRow[] = [];
  const byDiscipline = new Map<string, FefRow[]>();
  for (const r of rows) {
    const code = r.id && !r.id.startsWith("__fe-blank-") ? r.id : "";
    const disc = code ? disciplineForL1(code.slice(0, 3)) : "";
    if (disc && disc !== currentDiscipline) {
      const arr = byDiscipline.get(disc) ?? [];
      arr.push(r);
      byDiscipline.set(disc, arr);
    } else {
      local.push(r);
    }
  }
  return { local, byDiscipline };
}

export function parseTakeOffPaste(
  text: string,
  cbsOptions: CbsOption[],
  areaOptions: AreaMatchOption[] = [],
): ParsedTakeOffPaste {
  // Match on display code OR cost code, hyphen-insensitively. Display codes are
  // inserted first so they win any normalized collision with a cost code.
  const byCode = new Map<string, CbsOption>();
  for (const o of cbsOptions) {
    const key = normalizeCode(o.displayCode);
    if (key && !byCode.has(key)) byCode.set(key, o);
  }
  for (const o of cbsOptions) {
    if (!o.costCode) continue;
    const key = normalizeCode(o.costCode);
    if (key && !byCode.has(key)) byCode.set(key, o);
  }
  const byArea = buildAreaResolver(areaOptions);

  const unmatchedCodes: string[] = [];
  const rows = tokenize(text).map((raw) => {
    const match = raw.code ? byCode.get(normalizeCode(raw.code)) : undefined;
    if (raw.code && !match && !unmatchedCodes.includes(raw.code)) {
      unmatchedCodes.push(raw.code);
    }
    const area = raw.area
      ? (byArea.get(raw.area.trim().toLowerCase()) ?? "")
      : "";
    return makeFefRow({
      id: match ? match.displayCode : raw.code,
      name: match ? match.name : "",
      unit: match ? match.uom : "",
      description: raw.description,
      quantity: raw.quantity,
      laborFactor: raw.laborFactor,
      laborRate: raw.laborRate,
      laborHours: computeLaborHours(raw.quantity, raw.laborFactor),
      area,
      // Role/Schedule are global, so they import as-is (the exported Labor Rate
      // is kept as the row's snapshot rather than re-resolved). Notes is free text.
      role: raw.role,
      schedule: raw.schedule,
      notes: raw.notes,
    });
  });

  return { rows, unmatchedCodes };
}

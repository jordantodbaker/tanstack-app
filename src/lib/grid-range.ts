/**
 * Pure spreadsheet-range logic for the FEF Take Off grid: selection geometry,
 * clipboard (TSV) serialization/parsing, and the range mutations
 * (paste / clear / fill-down). No React or DOM here so every rule is
 * unit-tested and the table wiring stays a thin adapter.
 *
 * Coordinates are absolute row indices into the `FefRow[]` data array and
 * visible-column indices (position within `table.getVisibleLeafColumns()`).
 *
 * Only a defined set of columns are *writable* by range operations
 * (`RANGE_WRITABLE_COLUMNS`) — the free-text/numeric fields, the Area / Role /
 * Schedule pickers, the CBS-item Name picker, and the Crew Mix picker. Each
 * write mirrors its cell editor's side-effects: Quantity/Labor Factor recompute
 * Labor Hours; Role/Schedule re-resolve the Labor Rate; a Name (CBS code or
 * name) stamps id/name/unit; a Crew Mix snapshots the averaged wage onto the
 * Labor Rate and clears Role/Schedule. The derived (Labor Hours, Total Cost, ID,
 * Unit) and checkbox (Sub) columns are copy-only: they still serialize on copy
 * so a whole row exports to Excel, but paste/fill/clear skip them.
 */
import type { CbsOption, FefRow } from "./types";
import { crewMixAverageRate } from "./crew-mix-rate";

export type CellCoord = { row: number; col: number };
export type RangeSelection = { anchor: CellCoord; focus: CellCoord };
export type NormalizedRange = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

/** Order the anchor/focus corners into an inclusive min/max rectangle. */
export function normalizeRange(sel: RangeSelection): NormalizedRange {
  return {
    minRow: Math.min(sel.anchor.row, sel.focus.row),
    maxRow: Math.max(sel.anchor.row, sel.focus.row),
    minCol: Math.min(sel.anchor.col, sel.focus.col),
    maxCol: Math.max(sel.anchor.col, sel.focus.col),
  };
}

/** True when the selection covers more than a single cell. */
export function rangeSpansMultiple(sel: RangeSelection): boolean {
  const r = normalizeRange(sel);
  return r.minRow !== r.maxRow || r.minCol !== r.maxCol;
}

type RoleRate = { roleName: string; schedule: string; rate: number };
type AreaOption = { value: string; label: string };
type CrewMixLookup = {
  id: number;
  name: string;
  schedule: string;
  members: { roleName: string; count: number }[];
};

/** Lookups a range write needs, sourced from the table's `meta`. */
export type WriteCtx = {
  roleOptions: string[];
  scheduleOptions: string[];
  roleRates: RoleRate[];
  areaOptions: AreaOption[];
  cbsOptions: CbsOption[];
  crewMixOptions: CrewMixLookup[];
};

/** Columns a range paste / fill / clear is allowed to write. */
export const RANGE_WRITABLE_COLUMNS: ReadonlySet<string> = new Set([
  "description",
  "notes",
  "quantity",
  "laborFactor",
  "area",
  "role",
  "schedule",
  "name",
  "crewMixId",
]);

const DEFAULT_LABOR_FACTOR = "1";

/** Strip thousands separators / currency / whitespace from a pasted number,
 *  matching the paste-dialog parser so "1,200" and "$45.00" compute. */
function cleanNumber(raw: string): string {
  return raw.replace(/[$,\s]/g, "");
}

/** quantity × (factor || 1), to 1dp; "" when either isn't finite. Mirrors the
 *  grid's own Labor Hours derivation. */
function computeLaborHours(quantity: string, factor: string): string {
  const q = parseFloat(quantity);
  const f = parseFloat(factor !== "" ? factor : DEFAULT_LABOR_FACTOR);
  if (!Number.isFinite(q) || !Number.isFinite(f)) return "";
  return (q * f).toFixed(1);
}

/** Normalize a CBS code for matching: drop hyphens/whitespace, lowercase — so a
 *  pasted code matches whether it's the display code or cost code, with or
 *  without hyphens. Mirrors the paste-dialog parser. */
function normalizeCode(code: string): string {
  return code.replace(/[-\s]/g, "").toLowerCase();
}

/** Resolve pasted text to a CBS item: display code, then cost code (both
 *  hyphen-insensitive), then an exact item name (case-insensitive). */
function resolveCbs(raw: string, options: CbsOption[]): CbsOption | undefined {
  const norm = normalizeCode(raw);
  if (norm === "") return undefined;
  const byDisplay = options.find((o) => normalizeCode(o.displayCode) === norm);
  if (byDisplay) return byDisplay;
  const byCost = options.find(
    (o) => o.costCode && normalizeCode(o.costCode) === norm,
  );
  if (byCost) return byCost;
  const lower = raw.trim().toLowerCase();
  return options.find((o) => o.name.toLowerCase() === lower);
}

/** Resolve pasted text to a crew mix: its id, then its name (case-insensitive). */
function resolveCrewMix(
  raw: string,
  options: CrewMixLookup[],
): CrewMixLookup | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  return (
    options.find((o) => String(o.id) === t) ??
    options.find((o) => o.name.toLowerCase() === t.toLowerCase())
  );
}

/** Resolve the composite labor rate for a (role, schedule) pair, returning the
 *  changed field(s) plus the freshly looked-up `laborRate` (or ""). Mirrors
 *  `applyRoleRate` in the Role/Schedule cell editors. */
function applyRoleRate(
  changed: { role?: string; schedule?: string },
  current: { role: string; schedule: string },
  roleRates: RoleRate[],
): Partial<FefRow> {
  const role = changed.role ?? current.role;
  const schedule = changed.schedule ?? current.schedule;
  const match = roleRates.find(
    (r) => r.roleName === role && r.schedule === schedule,
  );
  return { ...changed, laborRate: match ? String(match.rate) : "" };
}

/**
 * Compute the field patch for writing `raw` text into `colId` of `row`.
 * Returns `null` for a non-writable column or an unresolvable select value
 * (so the cell is left untouched rather than corrupted). An empty `raw`
 * clears the cell (and any coupled derived field).
 */
export function resolveCellWrite(
  colId: string,
  raw: string,
  row: FefRow,
  ctx: WriteCtx,
): Partial<FefRow> | null {
  switch (colId) {
    case "description":
    case "notes":
      return { [colId]: raw } as Partial<FefRow>;
    case "quantity": {
      const q = cleanNumber(raw);
      return { quantity: q, laborHours: computeLaborHours(q, row.laborFactor) };
    }
    case "laborFactor": {
      const f = cleanNumber(raw).trim();
      // Storing the default verbatim is wasteful — leave it "" so a future
      // change to the default still flows through, matching LaborFactorInputCell.
      const persisted = f === DEFAULT_LABOR_FACTOR ? "" : f;
      return {
        laborFactor: persisted,
        laborHours: computeLaborHours(row.quantity, persisted),
      };
    }
    case "area": {
      if (raw.trim() === "") return { area: "" };
      const norm = (s: string) => s.trim().toLowerCase();
      const match = ctx.areaOptions.find(
        (o) => norm(o.value) === norm(raw) || norm(o.label) === norm(raw),
      );
      return match ? { area: match.value } : null;
    }
    case "role": {
      if (raw.trim() === "") return applyRoleRate({ role: "" }, row, ctx.roleRates);
      const match = ctx.roleOptions.find(
        (o) => o.toLowerCase() === raw.trim().toLowerCase(),
      );
      return match ? applyRoleRate({ role: match }, row, ctx.roleRates) : null;
    }
    case "schedule": {
      if (raw.trim() === "")
        return applyRoleRate({ schedule: "" }, row, ctx.roleRates);
      const match = ctx.scheduleOptions.find(
        (o) => o.toLowerCase() === raw.trim().toLowerCase(),
      );
      return match
        ? applyRoleRate({ schedule: match }, row, ctx.roleRates)
        : null;
    }
    case "name": {
      // The Name column is the CBS-item picker; its stored identity is the CBS
      // code in `id`. Clearing removes the whole item; a resolvable code/name
      // stamps id + name + unit (matching CbsSelectCell / CbsSearchSelectCell).
      if (raw.trim() === "") return { id: "", name: "", unit: "" };
      const match = resolveCbs(raw, ctx.cbsOptions);
      return match
        ? { id: match.displayCode, name: match.name, unit: match.uom }
        : null;
    }
    case "crewMixId": {
      // Mirrors CrewMixSelectCell: snapshot the average of the mix's member-role
      // rates at its schedule and clear role/schedule so the row's rate source
      // is unambiguous.
      if (raw.trim() === "") return { crewMixId: "", laborRate: "" };
      const match = resolveCrewMix(raw, ctx.crewMixOptions);
      if (!match) return null;
      const avg = crewMixAverageRate(match.members, match.schedule, ctx.roleRates);
      return {
        crewMixId: String(match.id),
        laborRate: avg > 0 ? avg.toFixed(2) : "",
        role: "",
        schedule: "",
      };
    }
    default:
      return null;
  }
}

/**
 * Human-readable text for a cell, used when copying a range to the clipboard.
 * Every column serializes (so a whole row exports to Excel) even though only
 * some are writable on paste. Select columns emit their display label.
 */
export function readCellText(colId: string, row: FefRow, ctx: WriteCtx): string {
  switch (colId) {
    case "__select":
    case "delete":
      return "";
    case "id":
      return row.id.startsWith("__fe-blank-") ? "" : row.id;
    case "sub":
      return row.sub === "true" ? "Yes" : "";
    case "totalCost": {
      const h = parseFloat(row.laborHours);
      const r = parseFloat(row.laborRate);
      return !isNaN(h) && !isNaN(r) && row.laborRate !== ""
        ? (h * r).toFixed(2)
        : "";
    }
    case "area": {
      const match = ctx.areaOptions.find((o) => o.value === row.area);
      return match ? match.label : row.area;
    }
    case "crewMixId": {
      const match = ctx.crewMixOptions.find((o) => String(o.id) === row.crewMixId);
      return match ? match.name : "";
    }
    default: {
      const v = (row as Record<string, unknown>)[colId];
      return typeof v === "string" ? v : "";
    }
  }
}

/** Serialize the selected rectangle to tab/newline-separated text (the format
 *  Excel and Google Sheets exchange on the clipboard). */
export function serializeRange(
  data: FefRow[],
  columnIds: string[],
  sel: RangeSelection,
  ctx: WriteCtx,
): string {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(sel);
  const lines: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const row = data[r];
    const cells: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      cells.push(row ? readCellText(columnIds[c], row, ctx) : "");
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/** Parse clipboard text into a 2D cell grid. Normalizes newlines and drops a
 *  single trailing blank line (Excel appends one). */
export function parseClipboardMatrix(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (normalized === "") return [[""]];
  return normalized.split("\n").map((line) => line.split("\t"));
}

/**
 * Write a pasted `matrix` into `data` with its top-left cell at `topLeft`,
 * spilling right and down. Grows the row set with blank rows when the paste
 * extends past the end (Excel-style), using `makeBlank` for fresh ids. Cells
 * over non-writable columns or unresolvable select values are left unchanged.
 * Returns a new array (one immutable update → one undo step).
 */
export function applyPaste(
  data: FefRow[],
  columnIds: string[],
  topLeft: CellCoord,
  matrix: string[][],
  ctx: WriteCtx,
  makeBlank: (index: number) => FefRow,
): FefRow[] {
  const needRows = topLeft.row + matrix.length;
  const next = data.slice();
  while (next.length < needRows) next.push(makeBlank(next.length));

  return next.map((row, ri) => {
    if (ri < topLeft.row || ri >= topLeft.row + matrix.length) return row;
    const cells = matrix[ri - topLeft.row];
    let patch: Partial<FefRow> | null = null;
    for (let ci = 0; ci < cells.length; ci++) {
      const colId = columnIds[topLeft.col + ci];
      if (!colId) continue;
      const base = patch ? { ...row, ...patch } : row;
      const p = resolveCellWrite(colId, cells[ci], base, ctx);
      if (p) patch = { ...(patch ?? {}), ...p };
    }
    return patch ? { ...row, ...patch } : row;
  });
}

/** Clear every writable cell in the selection (empty-string write, which also
 *  clears coupled derived fields). Non-writable columns are skipped. */
export function applyClear(
  data: FefRow[],
  columnIds: string[],
  sel: RangeSelection,
  ctx: WriteCtx,
): FefRow[] {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(sel);
  return data.map((row, ri) => {
    if (ri < minRow || ri > maxRow) return row;
    let patch: Partial<FefRow> | null = null;
    for (let c = minCol; c <= maxCol; c++) {
      const colId = columnIds[c];
      if (!RANGE_WRITABLE_COLUMNS.has(colId)) continue;
      const base = patch ? { ...row, ...patch } : row;
      const p = resolveCellWrite(colId, "", base, ctx);
      if (p) patch = { ...(patch ?? {}), ...p };
    }
    return patch ? { ...row, ...patch } : row;
  });
}

/** The raw source value replicated down when filling a column. The Name column
 *  fills by its CBS code (`id`) so the resolver matches by code rather than the
 *  less-reliable display name. */
function fillSourceValue(colId: string, src: FefRow): string {
  if (colId === "name") {
    return src.id.startsWith("__fe-blank-") ? "" : src.id;
  }
  const v = (src as Record<string, unknown>)[colId];
  return typeof v === "string" ? v : "";
}

/**
 * Copy the top row of the selection down through the remaining selected rows
 * (Excel's Ctrl+D / fill handle). Only writable columns are filled; each
 * target resolves the source's stored value against its own row so derived
 * fields (Labor Hours, Labor Rate) stay correct per row.
 */
export function applyFillDown(
  data: FefRow[],
  columnIds: string[],
  sel: RangeSelection,
  ctx: WriteCtx,
): FefRow[] {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(sel);
  const src = data[minRow];
  if (!src) return data;
  return data.map((row, ri) => {
    if (ri <= minRow || ri > maxRow) return row;
    let patch: Partial<FefRow> | null = null;
    for (let c = minCol; c <= maxCol; c++) {
      const colId = columnIds[c];
      if (!RANGE_WRITABLE_COLUMNS.has(colId)) continue;
      const base = patch ? { ...row, ...patch } : row;
      const p = resolveCellWrite(colId, fillSourceValue(colId, src), base, ctx);
      if (p) patch = { ...(patch ?? {}), ...p };
    }
    return patch ? { ...row, ...patch } : row;
  });
}

// `CbsOption` is re-exported for callers assembling a WriteCtx alongside cbs data.
export type { CbsOption };

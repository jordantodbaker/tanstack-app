/**
 * Pure spreadsheet-range logic for the FEF Take Off grid: selection geometry,
 * clipboard (TSV) serialization/parsing, and the range mutations
 * (paste / clear / fill-down). No React or DOM here so every rule is
 * unit-tested and the table wiring stays a thin adapter.
 *
 * Coordinates are absolute row indices into the `FefRow[]` data array and
 * visible-column indices (position within `table.getVisibleLeafColumns()`).
 *
 * Every column the take-off sheets give an editor is *writable* by range
 * operations (`RANGE_WRITABLE_COLUMNS`): the free-text/numeric fields, the Sub
 * checkbox, the Area / Role / Schedule / Crew Mix pickers, the CBS-item Name
 * picker, the steel dimensions, and the piping Size / Task Code / Shop-Field /
 * Weld Group pickers. Each write mirrors its cell editor's side-effects:
 * Quantity/Labor Factor recompute Labor Hours (through the piping factor table
 * on the piping sheet); # of Shapes / L recompute the steel Quantity;
 * Role/Schedule re-resolve the Labor Rate; a Name (CBS code or name) stamps
 * id/name/unit; a Crew Mix snapshots the averaged wage onto the Labor Rate and
 * clears Role/Schedule; Shop-Field / Weld Group re-derive the metallurgy code
 * and re-match the CBS item. Purely derived columns (Labor Hours, Total Cost,
 * ID, Unit, Total Tons) stay copy-only: they still serialize on copy so a whole
 * row exports to Excel, but paste/fill/clear skip them.
 *
 * A column with an editor but no entry in `RANGE_WRITABLE_COLUMNS` silently
 * ignores Ctrl+D / paste / Delete, so new take-off columns must be added here
 * as well as to the column defs.
 */
import type { CbsOption, FefRow } from "./types";
import { crewMixAverageRate } from "./crew-mix-rate";
import {
  cleanNumber,
  computeLaborHours,
  computeSteelQuantity,
  computeTotalCost,
  computeUnitCost,
  computeUnitHours,
  DEFAULT_LABOR_FACTOR,
  normalizeCode,
} from "./fef-derive";
import {
  deriveLaborHours,
  fabricationHint,
  resolveCbsStamp,
  type CbsNarrowing,
  type PipingFactorLookup,
} from "./piping-derive";
import { computeBoreSize } from "./utils";
import {
  CUSTOM_FIELD_SLOTS,
  fefRowHasUserData,
  isBlankId,
  isUntouchedBlankRow,
  MATERIAL_TYPES,
} from "./fef-helpers";

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
  /** Piping (task code, size) → labor factor; absent on non-piping sheets. */
  pipingFactorLookup?: PipingFactorLookup;
  /** Piping weld-group classification → shop/install metallurgy codes. */
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >;
  /** Structural-steel member designation → QTO UoM (SLTO_Data). */
  steelMemberUomLookup?: Record<string, string>;
};

/** The shape of a table meta this can read — `FefTableMeta`, structurally. */
type WriteCtxSource = {
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: RoleRate[];
  areaOptions?: AreaOption[];
  cbsOptions?: CbsOption[];
  crewMixOptions?: CrewMixLookup[];
  pipingFactorLookup?: PipingFactorLookup;
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >;
  steelMemberUomLookup?: Record<string, string>;
};

/**
 * A `WriteCtx` over a table meta's option lists. `FefTableContent` builds one
 * per grid, memoised on those lists, and both the range operations and the
 * cell editors derive through it — so the index below is built once and the
 * two paths read the same tables. Build a fresh one only when there is no
 * grid to take it from (a cell rendered on its own in a test).
 */
export function writeCtxFromMeta(meta: WriteCtxSource | undefined): WriteCtx {
  return {
    roleOptions: meta?.roleOptions ?? [],
    scheduleOptions: meta?.scheduleOptions ?? [],
    roleRates: meta?.roleRates ?? [],
    areaOptions: meta?.areaOptions ?? [],
    cbsOptions: meta?.cbsOptions ?? [],
    crewMixOptions: meta?.crewMixOptions ?? [],
    // Sheet-specific lookups; present only on the sheet that uses them, which
    // is also how a write tells a piping row from a steel one.
    pipingFactorLookup: meta?.pipingFactorLookup,
    weldGroupMaterialMap: meta?.weldGroupMaterialMap,
    steelMemberUomLookup: meta?.steelMemberUomLookup,
  };
}

/** Free-text / numeric columns that store exactly what's written, with no
 *  coupled field to recompute. Shared by the generic and piping take-offs
 *  (each sheet shows the subset its discipline needs). */
const PLAIN_TEXT_COLUMNS: ReadonlySet<string> = new Set([
  // User-defined take-off columns: free text with no derivation, so paste,
  // fill-down and clear treat them exactly like Description or Notes.
  ...CUSTOM_FIELD_SLOTS,
  "description",
  "notes",
  // Reference / line list
  "projectPhase",
  "drawingNumber",
  "drawingRev",
  "processUnit",
  "areaName",
  "systemName",
  "tagNumber",
  // Spec & testing (piping)
  "lineSpec",
  "paintSpec",
  "insulation",
  "nde",
  "pwht",
  "hydro",
  "heatTrace",
  // Location
  "agUg",
  "elevation",
  // Labor adjustments
  "siteFactor",
  "feetAboveGrade",
  "efficAdjust",
  "laborFactorAdj",
  "elevAdder",
  "weldAdder",
  // Steel dimensions that feed nothing (H / W are informational)
  "height",
  "width",
]);

/** Columns a range paste / fill / clear is allowed to write: every column the
 *  take-off sheets give an editor, whether it stores its text verbatim or
 *  resolves through a picker. Keep in step with the cell set in
 *  FefTable.tsx / Piping/columns.ts — a column missing here silently
 *  ignores Ctrl+D, paste, and Delete. */
export const RANGE_WRITABLE_COLUMNS: ReadonlySet<string> = new Set([
  ...PLAIN_TEXT_COLUMNS,
  "quantity",
  "laborFactor",
  "area",
  "role",
  "schedule",
  "name",
  "crewMixId",
  "sub",
  // Steel: Quantity is derived from these two.
  "length",
  "shapeCount",
  // Piping pickers (and the steel member picker, which shares "taskCode").
  "size",
  "taskCode",
  "shopField",
  "fabricateErect",
  "weldGroupDescription",
  // Equipment: fixed Bulk/Tagged vocabulary, validated on write.
  "materialType",
]);

/**
 * Prebuilt lookup tables over a `WriteCtx`'s option lists.
 *
 * Every select column used to resolve with `Array.find` *per cell*: a paste or
 * fill over the Name column re-scanned the discipline's whole CBS catalog
 * (~1,800 items on piping) for every row, re-normalizing each option's code as
 * it went. The tables below are built once per ctx and turn each resolution
 * into a hash lookup.
 *
 * Match semantics are preserved exactly, which is why the first insert for a
 * key wins: `Array.find` returns the earliest matching option, so a duplicate
 * code or label later in the list must not displace it.
 */
type WriteIndex = {
  /** Normalized display code -> item. */
  cbsByDisplayCode: Map<string, CbsOption>;
  /** Normalized cost code -> item (items without a cost code are skipped). */
  cbsByCostCode: Map<string, CbsOption>;
  /** Lowercased item name -> item. */
  cbsByName: Map<string, CbsOption>;
  /** Verbatim cost code -> item, for the piping metallurgy+bore lookup, which
   *  matches case-sensitively and must not go through `normalizeCode`. */
  cbsByExactCostCode: Map<string, CbsOption>;
  /** Trimmed + lowercased area id *or* label -> the stored area id. */
  areaIdByText: Map<string, string>;
  /** Area id -> its display label (the copy / sort read path). */
  areaLabelById: Map<string, string>;
  roleByLowerName: Map<string, string>;
  scheduleByLowerName: Map<string, string>;
  /** `role\u0000schedule` -> composite rate. */
  rateByRoleSchedule: Map<string, number>;
  crewById: Map<string, CrewMixLookup>;
  crewByLowerName: Map<string, CrewMixLookup>;
  /** Lowercased weld-group classification -> its stored (cased) key. */
  weldGroupByLowerName: Map<string, string>;
  /** Crew mix id -> its averaged labor rate, filled on first use. The average
   *  depends only on the mix and the rate table, so a fill-down over 500 rows
   *  computes it once instead of 500 times. */
  crewRateById: Map<string, string>;
};

/**
 * One index per ctx identity, keyed weakly so an index dies with its ctx.
 *
 * The invariant this relies on: **a `WriteCtx` and its option arrays are never
 * mutated in place.** `writeCtx` (table-utils.tsx) is a `useMemo` over the
 * option arrays, and those arrays come straight from queries, so a content
 * change always produces a new ctx object — and therefore a fresh index.
 * Pushing into `ctx.cbsOptions` instead of replacing it would leave a stale
 * index behind.
 */
const WRITE_INDEXES = new WeakMap<WriteCtx, WriteIndex>();

/** First insert wins - mirrors `Array.find` returning the earliest match. */
function setFirst<V>(map: Map<string, V>, key: string, value: V): void {
  if (!map.has(key)) map.set(key, value);
}

/** Composite key for the (role, schedule) rate table. NUL can't occur in
 *  either half, so it can't collide the way a "-" or "|" join could. */
function rateKey(role: string, schedule: string): string {
  return `${role}\u0000${schedule}`;
}

function buildWriteIndex(ctx: WriteCtx): WriteIndex {
  const idx: WriteIndex = {
    cbsByDisplayCode: new Map(),
    cbsByCostCode: new Map(),
    cbsByName: new Map(),
    cbsByExactCostCode: new Map(),
    areaIdByText: new Map(),
    areaLabelById: new Map(),
    roleByLowerName: new Map(),
    scheduleByLowerName: new Map(),
    rateByRoleSchedule: new Map(),
    crewById: new Map(),
    crewByLowerName: new Map(),
    weldGroupByLowerName: new Map(),
    crewRateById: new Map(),
  };

  for (const o of ctx.cbsOptions) {
    setFirst(idx.cbsByDisplayCode, normalizeCode(o.displayCode), o);
    if (o.costCode) {
      setFirst(idx.cbsByCostCode, normalizeCode(o.costCode), o);
      setFirst(idx.cbsByExactCostCode, o.costCode, o);
    }
    setFirst(idx.cbsByName, o.name.toLowerCase(), o);
  }
  for (const o of ctx.areaOptions) {
    // Id before label, per option: `find` tested both on each option before
    // moving to the next, so an earlier option's label beats a later one's id.
    setFirst(idx.areaIdByText, o.value.trim().toLowerCase(), o.value);
    setFirst(idx.areaIdByText, o.label.trim().toLowerCase(), o.value);
    setFirst(idx.areaLabelById, o.value, o.label);
  }
  for (const r of ctx.roleOptions) {
    setFirst(idx.roleByLowerName, r.toLowerCase(), r);
  }
  for (const sch of ctx.scheduleOptions) {
    setFirst(idx.scheduleByLowerName, sch.toLowerCase(), sch);
  }
  for (const r of ctx.roleRates) {
    setFirst(idx.rateByRoleSchedule, rateKey(r.roleName, r.schedule), r.rate);
  }
  for (const c of ctx.crewMixOptions) {
    setFirst(idx.crewById, String(c.id), c);
    setFirst(idx.crewByLowerName, c.name.toLowerCase(), c);
  }
  for (const k of Object.keys(ctx.weldGroupMaterialMap ?? {})) {
    setFirst(idx.weldGroupByLowerName, k.toLowerCase(), k);
  }

  return idx;
}

function indexFor(ctx: WriteCtx): WriteIndex {
  let idx = WRITE_INDEXES.get(ctx);
  if (!idx) {
    idx = buildWriteIndex(ctx);
    WRITE_INDEXES.set(ctx, idx);
  }
  return idx;
}

/** Resolve pasted text to a CBS item: display code, then cost code (both
 *  hyphen-insensitive), then an exact item name (case-insensitive). */
function resolveCbs(raw: string, idx: WriteIndex): CbsOption | undefined {
  const norm = normalizeCode(raw);
  if (norm === "") return undefined;
  return (
    idx.cbsByDisplayCode.get(norm) ??
    idx.cbsByCostCode.get(norm) ??
    idx.cbsByName.get(raw.trim().toLowerCase())
  );
}

/** Resolve pasted text to a crew mix: its id, then its name (case-insensitive). */
function resolveCrewMix(
  raw: string,
  idx: WriteIndex,
): CrewMixLookup | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  return idx.crewById.get(t) ?? idx.crewByLowerName.get(t.toLowerCase());
}

/** A crew mix's averaged labor rate as the row stores it. Computed once per mix
 *  per ctx - the average depends only on the mix and the rate table, never on
 *  the row being written. */
function crewMixRate(
  mix: CrewMixLookup,
  ctx: WriteCtx,
  idx: WriteIndex,
): string {
  const key = String(mix.id);
  const cached = idx.crewRateById.get(key);
  if (cached !== undefined) return cached;
  const avg = crewMixAverageRate(mix.members, mix.schedule, ctx.roleRates);
  const rate = avg > 0 ? avg.toFixed(2) : "";
  idx.crewRateById.set(key, rate);
  return rate;
}

/** Resolve the composite labor rate for a (role, schedule) pair, returning the
 *  changed field(s) plus the freshly looked-up `laborRate` (or ""). Mirrors
 *  `applyRoleRate` in the Role/Schedule cell editors. */
function applyRoleRate(
  changed: { role?: string; schedule?: string },
  current: { role: string; schedule: string },
  idx: WriteIndex,
): Partial<FefRow> {
  const role = changed.role ?? current.role;
  const schedule = changed.schedule ?? current.schedule;
  const rate = idx.rateByRoleSchedule.get(rateKey(role, schedule));
  return { ...changed, laborRate: rate !== undefined ? String(rate) : "" };
}

/** True when this sheet's rows derive Labor Hours from the piping factor table
 *  (task code + size) rather than quantity × labor factor. */
function isPipingSheet(ctx: WriteCtx): boolean {
  return ctx.pipingFactorLookup !== undefined;
}

/** Labor Hours for a row after a range write, using whichever derivation the
 *  sheet's own cell editors use. */
function laborHoursFor(row: FefRow, ctx: WriteCtx): string {
  return isPipingSheet(ctx)
    ? deriveLaborHours(row, ctx.pipingFactorLookup)
    : computeLaborHours(row.quantity, row.laborFactor);
}

/** The id/name/unit stamp a piping row picks up from its metallurgy code +
 *  bore size — `{}` only when the inputs are too incomplete to look anything
 *  up. A lookup that ran and matched nothing clears the row's item, exactly as
 *  the cell editors do; see `resolveCbsStamp`. */
function cbsStamp(
  metallurgyCode: string,
  boreSize: string,
  idx: WriteIndex,
  fabrication?: CbsNarrowing,
): Partial<FefRow> {
  const stamp = resolveCbsStamp(
    metallurgyCode,
    boreSize,
    (code) => idx.cbsByExactCostCode.get(code),
    fabrication,
  );
  return stamp ?? {};
}

/** Metallurgy code for a (weld group, shop/field) pair — "" when either half
 *  is missing or the classification isn't in the material map. */
function metallurgyFor(
  weldGroupDescription: string,
  shopField: string,
  ctx: WriteCtx,
): string {
  const entry = weldGroupDescription
    ? ctx.weldGroupMaterialMap?.[weldGroupDescription]
    : undefined;
  if (!entry || !shopField) return "";
  return shopField === "Shop" ? entry.shopCode : entry.installCode;
}

/** Parse a Sub checkbox cell. Accepts the stored "true" (fill-down) and the
 *  serialized "Yes" (clipboard round-trip); anything else is unresolvable. */
function parseSub(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t === "") return "";
  if (t === "true" || t === "yes" || t === "y" || t === "x" || t === "1")
    return "true";
  if (t === "false" || t === "no" || t === "n" || t === "0") return "";
  return null;
}

/**
 * Writing a cell is two steps, and the cell editors and the range operations
 * share the second:
 *
 * 1. `parseCellValue` turns text (pasted, filled, typed into Find/Replace)
 *    into the value the column stores — a number cleaned up, a picker option
 *    matched case-insensitively, "Yes" read as a ticked box — or `null` when
 *    the text resolves to nothing the column's editor could have produced.
 * 2. `deriveRowPatch` turns that stored value into the whole patch: the
 *    field itself plus everything coupled to it — Labor Hours from Quantity,
 *    the steel Quantity from # of Shapes × L, the Labor Rate from Role and
 *    Schedule, the CBS stamp from the piping inputs.
 *
 * A cell editor already holds a stored value (its dropdown option, its typed
 * number), so it calls `deriveRowPatch` directly; a paste goes through both.
 * Until 2026-11-03 the editors carried their own copies of step 2, and the
 * two drifted.
 */

/** Canonical Shop / Field, or `null` for anything else. */
function parseShopField(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  return t === "" ? "" : t === "shop" ? "Shop" : t === "field" ? "Field" : null;
}

/** Canonical Fabricate / Erect, or `null` for anything else. */
function parseFabricateErect(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  return t === ""
    ? ""
    : t === "fabricate"
      ? "Fabricate"
      : t === "erect"
        ? "Erect"
        : null;
}

/**
 * The stored value `raw` text resolves to in `colId`, or `null` when it does
 * not resolve (an unknown picker option, a non-writable column). Blank always
 * resolves to blank: clearing is a write.
 */
export function parseCellValue(
  colId: string,
  raw: string,
  ctx: WriteCtx,
): string | null {
  const idx = indexFor(ctx);
  const t = raw.trim();
  switch (colId) {
    case "sub":
      return parseSub(raw);
    case "quantity":
    case "length":
    case "shapeCount":
    case "size":
      return cleanNumber(raw);
    case "laborFactor":
      return cleanNumber(raw).trim();
    case "taskCode":
      // Trimmed only: `deriveRowPatch` decides whether either lookup knows it.
      return t;
    case "shopField":
      return parseShopField(raw);
    case "fabricateErect":
      return parseFabricateErect(raw);
    case "weldGroupDescription":
      // Match the stored classification case-insensitively; an unknown one is
      // unresolvable (the picker only offers mapped classifications).
      return t === ""
        ? ""
        : (idx.weldGroupByLowerName.get(t.toLowerCase()) ?? null);
    case "area":
      return t === "" ? "" : (idx.areaIdByText.get(t.toLowerCase()) ?? null);
    case "role":
      return t === "" ? "" : (idx.roleByLowerName.get(t.toLowerCase()) ?? null);
    case "schedule":
      return t === ""
        ? ""
        : (idx.scheduleByLowerName.get(t.toLowerCase()) ?? null);
    case "materialType": {
      // A fixed vocabulary, so a paste has to resolve to one of the options
      // rather than being taken verbatim — otherwise a stray spreadsheet value
      // ("BULK ", "tag") lands in a field that reporting groups on. Blank
      // clears, matching the dropdown's placeholder row; anything else is
      // refused (the cell keeps its value) rather than silently blanked.
      if (t === "") return "";
      return (
        MATERIAL_TYPES.find((m) => m.toLowerCase() === t.toLowerCase()) ?? null
      );
    }
    case "name": {
      // On piping the CBS item is DERIVED from Weld Group + Shop/Field + Size
      // + Fabricate/Erect, so Name is read-only there (see Piping/columns.ts).
      // Copy-only, like the other derived columns: a pasted value would stand
      // until the next edit to any of those four silently re-stamped it.
      // Bulk loading a piping sheet from a spreadsheet still works — the
      // "Paste from Excel" dialog reads a CBS Code column, not this one.
      if (isPipingSheet(ctx)) return null;
      // Elsewhere the Name column IS the CBS-item picker; its stored identity
      // is the CBS code in `id`: a display code, a cost code or an item name
      // all resolve to it.
      if (t === "") return "";
      return resolveCbs(raw, idx)?.displayCode ?? null;
    }
    case "crewMixId":
      // Its id, or its name; stored as the id.
      if (t === "") return "";
      return resolveCrewMix(raw, idx)?.id.toString() ?? null;
    default:
      return PLAIN_TEXT_COLUMNS.has(colId) ? raw : null;
  }
}

/**
 * The patch for storing `value` in `colId` of `row`: the field itself and
 * every field coupled to it. `value` is a stored value — what a picker
 * offers, what `parseCellValue` returns — never raw pasted text. Returns
 * `null` for a non-writable column, or a value the column's lookups do not
 * know (so the cell is left untouched rather than corrupted).
 */
export function deriveRowPatch(
  colId: string,
  value: string,
  row: FefRow,
  ctx: WriteCtx,
): Partial<FefRow> | null {
  const idx = indexFor(ctx);
  switch (colId) {
    case "sub":
      return { sub: value };
    case "quantity":
      return {
        quantity: value,
        laborHours: laborHoursFor({ ...row, quantity: value }, ctx),
      };
    case "length":
    case "shapeCount": {
      // Steel: Quantity is derived (# of shapes × L), so writing either input
      // recomputes it — and Labor Hours with it.
      const next = { ...row, [colId]: value } as FefRow;
      const quantity = computeSteelQuantity(next.shapeCount, next.length);
      return {
        [colId]: value,
        quantity,
        laborHours: laborHoursFor({ ...next, quantity }, ctx),
      } as Partial<FefRow>;
    }
    case "size": {
      // Piping: Size drives the bore size, the factor lookup (Labor Hours) and
      // the CBS match.
      const boreSize = computeBoreSize(value);
      return {
        size: value,
        boreSize,
        laborHours: laborHoursFor({ ...row, size: value }, ctx),
        ...cbsStamp(
          row.metallurgyCode,
          boreSize,
          idx,
          // The new size/bore, not the row's stale pair.
          fabricationHint({ ...row, size: value, boreSize }),
        ),
      };
    }
    case "taskCode": {
      if (value === "") {
        return {
          taskCode: "",
          unit: "",
          laborHours: laborHoursFor({ ...row, taskCode: "" }, ctx),
        };
      }
      // "taskCode" is the piping task code on the piping sheet and the SLTO
      // member designation on structural steel; both stamp Unit from their own
      // lookup. Reject a code neither table knows rather than writing a value
      // the picker itself could never have produced.
      const pipingEntry = ctx.pipingFactorLookup?.get(value);
      if (pipingEntry) {
        // Re-resolve CBS from the row's current metallurgy + bore. The task
        // code is not itself part of the cost code, so this can only pick up
        // a match the row's *other* inputs have since made available — or
        // drop one they have invalidated.
        const stamp = cbsStamp(
          row.metallurgyCode,
          row.boreSize,
          idx,
          fabricationHint(row),
        );
        return {
          taskCode: value,
          laborHours: deriveLaborHours(
            { ...row, taskCode: value },
            ctx.pipingFactorLookup,
          ),
          ...stamp,
          // A resolved CBS item's UoM wins; with no item to take one from,
          // the unit falls back to the task code's own from the factor table
          // rather than being cleared along with the rest of the stamp.
          unit: stamp.id ? (stamp.unit ?? pipingEntry.unit) : pipingEntry.unit,
        };
      }
      const steelUom = ctx.steelMemberUomLookup?.[value];
      return steelUom === undefined
        ? null
        : { taskCode: value, unit: steelUom };
    }
    case "shopField": {
      const metallurgyCode = metallurgyFor(
        row.weldGroupDescription,
        value,
        ctx,
      );
      return {
        shopField: value,
        metallurgyCode,
        ...cbsStamp(metallurgyCode, row.boreSize, idx, fabricationHint(row)),
      };
    }
    case "fabricateErect":
      // Fabricate/Erect selects between the catalog's -FB-/-ER- variants, so it
      // re-resolves the CBS item exactly as Shop/Field and Size do. Clearing it
      // re-resolves too, dropping the row back to the rollup it came from.
      return {
        fabricateErect: value,
        ...cbsStamp(
          row.metallurgyCode,
          row.boreSize,
          idx,
          fabricationHint({ ...row, fabricateErect: value }),
        ),
      };
    case "weldGroupDescription": {
      const metallurgyCode = metallurgyFor(value, row.shopField, ctx);
      return {
        weldGroupDescription: value,
        metallurgyCode,
        ...cbsStamp(metallurgyCode, row.boreSize, idx, fabricationHint(row)),
      };
    }
    case "laborFactor": {
      // Storing the default verbatim is wasteful — leave it "" so a future
      // change to the default still flows through.
      const persisted = value === DEFAULT_LABOR_FACTOR ? "" : value;
      return {
        laborFactor: persisted,
        laborHours: laborHoursFor({ ...row, laborFactor: persisted }, ctx),
      };
    }
    case "area":
      return { area: value };
    case "role":
      return applyRoleRate({ role: value }, row, idx);
    case "schedule":
      return applyRoleRate({ schedule: value }, row, idx);
    case "materialType":
      return { materialType: value };
    case "name": {
      // Clearing removes the whole item; a code stamps id + name + unit.
      if (value === "") return { id: "", name: "", unit: "" };
      const match = idx.cbsByDisplayCode.get(normalizeCode(value));
      return match
        ? { id: match.displayCode, name: match.name, unit: match.uom }
        : null;
    }
    case "crewMixId": {
      // Snapshot the average of the mix's member-role rates at its schedule
      // and clear role/schedule so the row's rate source is unambiguous.
      if (value === "") return { crewMixId: "", laborRate: "" };
      const match = idx.crewById.get(value);
      if (!match) return null;
      return {
        crewMixId: String(match.id),
        laborRate: crewMixRate(match, ctx, idx),
        role: "",
        schedule: "",
      };
    }
    default:
      return PLAIN_TEXT_COLUMNS.has(colId)
        ? ({ [colId]: value } as Partial<FefRow>)
        : null;
  }
}

/**
 * Compute the field patch for writing `raw` text into `colId` of `row`:
 * `parseCellValue`, then `deriveRowPatch`. Returns `null` for a non-writable
 * column or an unresolvable select value (so the cell is left untouched
 * rather than corrupted). An empty `raw` clears the cell (and any coupled
 * derived field).
 */
export function resolveCellWrite(
  colId: string,
  raw: string,
  row: FefRow,
  ctx: WriteCtx,
): Partial<FefRow> | null {
  const value = parseCellValue(colId, raw, ctx);
  return value === null ? null : deriveRowPatch(colId, value, row, ctx);
}

/**
 * Human-readable text for a cell, used when copying a range to the clipboard.
 * Every column serializes (so a whole row exports to Excel) even though only
 * some are writable on paste. Select columns emit their display label.
 */
export function readCellText(
  colId: string,
  row: FefRow,
  ctx: WriteCtx,
): string {
  const idx = indexFor(ctx);
  switch (colId) {
    case "__select":
    case "delete":
      return "";
    case "id":
      return isBlankId(row.id) ? "" : row.id;
    case "sub":
      return row.sub === "true" ? "Yes" : "";
    case "totalCost":
      return computeTotalCost(row.laborHours, row.laborRate);
    // Derived like Total Cost, so it is copy-only: it serializes here so a
    // whole row still exports to Excel, but paste/fill/clear skip it.
    case "unitRate":
      return computeUnitCost(row.laborHours, row.laborRate, row.quantity);
    case "unitHours":
      return computeUnitHours(row.laborHours, row.quantity);
    case "area": {
      return idx.areaLabelById.get(row.area) ?? row.area;
    }
    case "crewMixId": {
      return idx.crewById.get(row.crewMixId)?.name ?? "";
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
    return isBlankId(src.id) ? "" : src.id;
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

/**
 * Sort the sheet by a column's displayed text, ascending or descending. This
 * physically reorders the rows (not a view-only sort) so the grid's index-based
 * selection / fill / copy stay correct and the order persists. Cells that both
 * parse as numbers compare numerically; otherwise locale string compare. Empty
 * trailing blank rows are held at the bottom so the entry buffer isn't scattered
 * into the middle. Pure — returns a new array.
 */
export function sortRows(
  data: FefRow[],
  colId: string,
  dir: "asc" | "desc",
  ctx: WriteCtx,
): FefRow[] {
  const isBlank = isUntouchedBlankRow;
  const real = data.filter((r) => !isBlank(r));
  const blanks = data.filter(isBlank);
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...real].sort((a, b) => {
    const av = readCellText(colId, a, ctx);
    const bv = readCellText(colId, b, ctx);
    const an = parseFloat(av.replace(/[$,\s]/g, ""));
    const bn = parseFloat(bv.replace(/[$,\s]/g, ""));
    if (av !== "" && bv !== "" && Number.isFinite(an) && Number.isFinite(bn)) {
      return (an - bn) * sign;
    }
    // Blanks (unwritten cells) sort to the end regardless of direction.
    if (av === "" && bv !== "") return 1;
    if (bv === "" && av !== "") return -1;
    return av.localeCompare(bv) * sign;
  });
  return [...sorted, ...blanks];
}

/** Case-insensitive replace-all of `query` with `replacement` in `text`. */
function replaceCI(text: string, query: string, replacement: string): string {
  if (query === "") return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(esc, "gi"), replacement);
}

/**
 * Coordinates of every cell whose displayed text contains `query`
 * (case-insensitive), scanned row-major. Empty `query` → no matches.
 */
export function findMatches(
  data: FefRow[],
  columnIds: string[],
  query: string,
  ctx: WriteCtx,
): CellCoord[] {
  const q = query.toLowerCase();
  if (q === "") return [];
  const out: CellCoord[] = [];
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < columnIds.length; c++) {
      if (readCellText(columnIds[c], row, ctx).toLowerCase().includes(q)) {
        out.push({ row: r, col: c });
      }
    }
  }
  return out;
}

/**
 * Replace all occurrences of `query` with `replacement` in one cell (writable
 * columns only; others and unresolvable results are left untouched). Returns a
 * new array only when something changed.
 */
export function replaceInCell(
  data: FefRow[],
  columnIds: string[],
  coord: CellCoord,
  query: string,
  replacement: string,
  ctx: WriteCtx,
): FefRow[] {
  const colId = columnIds[coord.col];
  const row = data[coord.row];
  if (!row || query === "" || !RANGE_WRITABLE_COLUMNS.has(colId)) return data;
  const text = readCellText(colId, row, ctx);
  if (!text.toLowerCase().includes(query.toLowerCase())) return data;
  const patch = resolveCellWrite(
    colId,
    replaceCI(text, query, replacement),
    row,
    ctx,
  );
  if (!patch) return data;
  return data.map((r, i) => (i === coord.row ? { ...r, ...patch } : r));
}

/**
 * Replace across the whole sheet in writable columns. Returns the new data and
 * the number of cells changed.
 */
export function replaceAll(
  data: FefRow[],
  columnIds: string[],
  query: string,
  replacement: string,
  ctx: WriteCtx,
): { data: FefRow[]; count: number } {
  if (query === "") return { data, count: 0 };
  const q = query.toLowerCase();
  let count = 0;
  const next = data.map((row) => {
    let patch: Partial<FefRow> | null = null;
    for (let c = 0; c < columnIds.length; c++) {
      const colId = columnIds[c];
      if (!RANGE_WRITABLE_COLUMNS.has(colId)) continue;
      const base = patch ? { ...row, ...patch } : row;
      const text = readCellText(colId, base, ctx);
      if (!text.toLowerCase().includes(q)) continue;
      const p = resolveCellWrite(
        colId,
        replaceCI(text, query, replacement),
        base,
        ctx,
      );
      if (p) {
        patch = { ...(patch ?? {}), ...p };
        count++;
      }
    }
    return patch ? { ...row, ...patch } : row;
  });
  return { data: next, count };
}

/** Insert `count` blank rows at `index` (0 = top, clamped to the array). */
export function insertRows(
  data: FefRow[],
  index: number,
  count: number,
  makeBlank: (i: number) => FefRow,
): FefRow[] {
  if (count <= 0) return data;
  const at = Math.max(0, Math.min(index, data.length));
  const blanks = Array.from({ length: count }, (_, i) => makeBlank(i));
  return [...data.slice(0, at), ...blanks, ...data.slice(at)];
}

/** Delete the rows in `[minRow, maxRow]` (inclusive). Returns a new array. */
export function deleteRows(
  data: FefRow[],
  minRow: number,
  maxRow: number,
): FefRow[] {
  return data.filter((_, i) => i < minRow || i > maxRow);
}

export type SelectionStats = {
  /** Non-empty cells in the selection. */
  count: number;
  /** Selected cells whose text parses as a finite number. */
  numericCount: number;
  /** Sum of the numeric cells. */
  sum: number;
  /** Average of the numeric cells (0 when there are none). */
  average: number;
};

/**
 * Excel-style aggregate of the selected cells for the status bar: Count of
 * non-empty cells, plus Sum and Average over the ones that parse as numbers.
 * Currency symbols / thousands separators are stripped before parsing, matching
 * the paste/number handling elsewhere, and derived columns (Total Cost) read
 * through `readCellText` so their computed values count.
 */
export function selectionStats(
  data: FefRow[],
  columnIds: string[],
  sel: RangeSelection,
  ctx: WriteCtx,
): SelectionStats {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(sel);
  let count = 0;
  let numericCount = 0;
  let sum = 0;
  for (let r = minRow; r <= maxRow; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = minCol; c <= maxCol; c++) {
      const text = readCellText(columnIds[c], row, ctx).trim();
      if (text === "") continue;
      count++;
      const n = parseFloat(text.replace(/[$,\s]/g, ""));
      if (Number.isFinite(n)) {
        numericCount++;
        sum += n;
      }
    }
  }
  return {
    count,
    numericCount,
    sum,
    average: numericCount === 0 ? 0 : sum / numericCount,
  };
}

// `CbsOption` is re-exported for callers assembling a WriteCtx alongside cbs data.
export type { CbsOption };

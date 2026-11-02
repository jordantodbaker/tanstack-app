/**
 * Expands the condensed CBS master into the CBS Dictionary workbook.
 *
 * The master (`prisma/data/CBS.master.xlsx`) carries one row per account with
 * four-segment codes (`012-05-1000-00`) and a YES/NO flag per cost type. The
 * loader and everything below it want the expanded form the workbook used to
 * arrive in: a "-0" roll-up row per account plus one typed row per flag that
 * is YES. The roll-up is written only where it has something to summarize:
 * an account with exactly one YES flag and no account beneath it gets its
 * typed row alone, since a roll-up over a single row says nothing. An
 * account with no YES flag at all keeps its roll-up, or it would vanish.
 * This module is that rule, kept free of Excel so it can be tested on plain
 * objects; `scripts/expand-cbs-workbook.ts` does the reading and writing.
 *
 * Rows are handled as header-to-value maps rather than a fixed shape, so a
 * column added to the master passes straight through to the expanded sheet
 * without a code change here. Only the columns a rule names are touched.
 *
 * The rules are still being settled; the constants below are the knobs.
 */
import { getGroupL1 } from "./cbs/codes";
import { LEVEL_DEFAULT } from "./cbs/types";

export type CellValue = string | number | boolean | null;

/** One master row: the 1-based sheet row and its cells by header. */
export type MasterRow = { row: number; cells: Record<string, CellValue> };

export type ExpandedRowType =
  | "Original"
  | "Labor"
  | "Subcontract"
  | "Material"
  | "Equipment"
  | "Other"
  | "Rental";

export type ExpandedRow = {
  cells: Record<string, CellValue>;
  rowType: ExpandedRowType;
  /** The master row this came from. */
  sourceRow: number;
};

/** Column headers the rules read or write. Matched by name, never position. */
export const COL = {
  displayCode: "Display Code",
  costCode: "Cost Code",
  name: "Name",
  gl: "G/L",
  costClassification: "Cost Classification",
  materialType: "Material Type",
  description: "Description",
  rowType: "Row Type",
  originalRow: "Original Row",
} as const;

export type CostTypeRule = {
  /** The YES/NO flag column that turns this row on. */
  flag: string;
  /** Trailing code segment: "012-05-1000-00-L", cost code "0120510000L". */
  type: "L" | "S" | "M" | "E" | "O" | "R";
  rowType: Exclude<ExpandedRowType, "Original">;
  gl: number;
  /** Null keeps the master row's own classification. */
  costClassification: string | null;
  /** "Labor cost for ..." */
  noun: string;
};

/** In the order the rows appear under their roll-up. */
export const COST_TYPE_RULES: readonly CostTypeRule[] = [
  {
    flag: "Labor Code",
    type: "L",
    rowType: "Labor",
    gl: 5000,
    costClassification: null,
    noun: "Labor",
  },
  {
    flag: "Sub Code",
    type: "S",
    rowType: "Subcontract",
    gl: 5200,
    costClassification: "DIRECT SUBCONTRACT",
    noun: "Subcontract",
  },
  {
    flag: "Material Code",
    type: "M",
    rowType: "Material",
    gl: 5100,
    costClassification: "MATERIALS",
    noun: "Material",
  },
  {
    flag: "Equipment Code",
    type: "E",
    rowType: "Equipment",
    gl: 5300,
    costClassification: "DIRECT EQUIPMENT",
    noun: "Equipment",
  },
  {
    flag: "Other Code",
    type: "O",
    rowType: "Other",
    gl: 5400,
    costClassification: null,
    noun: "Other",
  },
  {
    flag: "Rental Code",
    type: "R",
    rowType: "Rental",
    gl: 5500,
    costClassification: null,
    noun: "Rental",
  },
];

/** The roll-up row's cost type. */
export const ROLLUP_TYPE = "0";

/**
 * A master "Material Type" of Both means two material rows, one per kind.
 * "Bulk" rather than "Bulks": it is the spelling the other 400-odd material
 * rows already use, so filters on the column keep matching.
 */
export const MATERIAL_TYPE_BOTH = "Both";
export const MATERIAL_TYPE_SPLIT: readonly string[] = ["Bulk", "Tagged"];
/** What a non-material row of a Both account carries, since no row keeps Both. */
export const MATERIAL_TYPE_NONE = "n/a";

/** The condensed master code, no cost-type segment. */
const MASTER_CODE_RE = /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}$/;
/** An expanded code: the file is already what this produces. */
const EXPANDED_CODE_RE =
  /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}-[0-9A-Z]$/;
/** "(S)" / "(*)" on a name, the marker this module adds. */
const NAME_MARKER_RE = /\((\*|[A-Z])\)\s*$/;

export type ExpansionStats = {
  masterRows: number;
  originals: number;
  generated: Record<CostTypeRule["rowType"], number>;
  /** Accounts whose Both material type became two material rows. */
  materialBothSplit: number;
  /**
   * Accounts written without a roll-up row: one cost type and nothing
   * beneath them, so the typed row stands for the account by itself.
   */
  rollupsSkipped: number;
  total: number;
};

/**
 * The master codes that have other master codes beneath them.
 *
 * A code is beneath another when zeroing any of its trailing non-"00"
 * segments reaches it — the parent lookup CBS Health uses, which also catches
 * the pipe shop's 610-LB-1200-ST under 610-LB-1200-00 (the tree hangs those
 * variants off that roll-up too, through a shared lineage key) — or when the
 * other is its division root (`getGroupL1`: 010 above 012, 600 above 601),
 * which is where the tree roots an L1 account.
 */
export function masterCodesWithDescendants(
  codes: Iterable<string>,
): Set<string> {
  const all = new Set(codes);
  const parents = new Set<string>();
  const consider = (code: string) => {
    if (all.has(code)) parents.add(code);
  };
  for (const code of all) {
    const [l1, l2, l34, l5] = code.split("-");
    const parts = [l2, l34.slice(0, 2), l34.slice(2), l5];
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === LEVEL_DEFAULT) continue;
      parts[i] = LEVEL_DEFAULT;
      consider(`${l1}-${parts[0]}-${parts[1]}${parts[2]}-${parts[3]}`);
    }
    const root = getGroupL1(l1);
    if (root !== l1) {
      consider(
        `${root}-${LEVEL_DEFAULT}-${LEVEL_DEFAULT}${LEVEL_DEFAULT}-${LEVEL_DEFAULT}`,
      );
    }
  }
  return parents;
}

export type ExpansionPlan = {
  headers: string[];
  rows: ExpandedRow[];
  stats: ExpansionStats;
  /** Why the plan is unsafe. Non-empty means write nothing. */
  problems: string[];
  /** Worth a look, but the file is still written. */
  warnings: string[];
};

const text = (v: CellValue | undefined): string =>
  v === null || v === undefined ? "" : `${v}`.trim();

/** YES / NO (also Y/N, TRUE/FALSE, blank = NO); null for anything else. */
export function flagValue(v: CellValue | undefined): boolean | null {
  if (typeof v === "boolean") return v;
  const t = text(v).toUpperCase();
  if (t === "YES" || t === "Y" || t === "TRUE") return true;
  if (t === "NO" || t === "N" || t === "FALSE" || t === "") return false;
  return null;
}

export const rollupDescription = (name: string) =>
  `Roll-up code for ${name} (summarizes all cost types).`;
export const costTypeDescription = (noun: string, name: string) =>
  `${noun} cost for ${name}.`;

/**
 * Plans the expanded sheet: `headers` is the master's header list with
 * "Row Type" and "Original Row" appended when the master lacks them, and each
 * row's `cells` is keyed by those headers.
 */
export function planCbsWorkbookExpansion(
  masterHeaders: string[],
  master: MasterRow[],
): ExpansionPlan {
  const problems: string[] = [];
  const warnings: string[] = [];
  const headers = [...masterHeaders];
  for (const h of [COL.rowType, COL.originalRow]) {
    if (!headers.includes(h)) headers.push(h);
  }
  const needed = [
    COL.displayCode,
    COL.name,
    ...COST_TYPE_RULES.map((r) => r.flag),
  ];
  for (const h of needed) {
    if (!masterHeaders.includes(h))
      problems.push(`master has no "${h}" column`);
  }

  const stats: ExpansionStats = {
    masterRows: 0,
    originals: 0,
    generated: {
      Labor: 0,
      Subcontract: 0,
      Material: 0,
      Equipment: 0,
      Other: 0,
      Rental: 0,
    },
    materialBothSplit: 0,
    rollupsSkipped: 0,
    total: 0,
  };
  const rows: ExpandedRow[] = [];
  const seenMaster = new Map<string, number>();
  const seenExpanded = new Map<string, number>();
  let expandedInput = 0;
  let costCodeMismatches = 0;
  // Whether a roll-up has anything beneath it is a question about the whole
  // master, so it is answered before the rows are walked.
  const parents = masterCodesWithDescendants(
    master
      .map(({ cells }) => text(cells[COL.displayCode]).toUpperCase())
      .filter((code) => MASTER_CODE_RE.test(code)),
  );

  for (const { row, cells } of master) {
    const displayCode = text(cells[COL.displayCode]).toUpperCase();
    const name = text(cells[COL.name]);
    if (!displayCode && !name) continue;
    stats.masterRows++;

    if (EXPANDED_CODE_RE.test(displayCode)) {
      expandedInput++;
      continue;
    }
    if (!MASTER_CODE_RE.test(displayCode)) {
      problems.push(
        `row ${row}: display code "${displayCode}" is not XXX-XX-XXXX-XX`,
      );
      continue;
    }
    if (!name) {
      problems.push(`row ${row}: ${displayCode} has no name`);
      continue;
    }
    const firstRow = seenMaster.get(displayCode);
    if (firstRow !== undefined) {
      problems.push(`row ${row}: ${displayCode} duplicates row ${firstRow}`);
      continue;
    }
    seenMaster.set(displayCode, row);
    if (NAME_MARKER_RE.test(name)) {
      warnings.push(
        `row ${row}: name "${name}" already ends in a cost-type marker`,
      );
    }

    const costCode = displayCode.replace(/-/g, "");
    const sheetCostCode = text(cells[COL.costCode]);
    if (sheetCostCode && sheetCostCode !== costCode) costCodeMismatches++;

    const flags: Partial<Record<CostTypeRule["type"], boolean>> = {};
    for (const rule of COST_TYPE_RULES) {
      const f = flagValue(cells[rule.flag]);
      if (f === null) {
        problems.push(
          `row ${row}: ${displayCode} has "${rule.flag}" = "${text(cells[rule.flag])}", expected YES or NO`,
        );
      }
      flags[rule.type] = f === true;
    }

    const materialType = text(cells[COL.materialType]);
    const isBoth =
      materialType.toUpperCase() === MATERIAL_TYPE_BOTH.toUpperCase();
    if (isBoth && !flags.M) {
      warnings.push(
        `row ${row}: ${displayCode} has Material Type Both but Material Code NO; written as ${MATERIAL_TYPE_NONE}`,
      );
    }

    const typed = (
      type: string,
      extra: Record<string, CellValue>,
    ): Record<string, CellValue> => ({
      ...cells,
      [COL.displayCode]: `${displayCode}-${type}`,
      [COL.costCode]: `${costCode}${type}`,
      // Nothing keeps Both: the material rows take a kind each, the rest n/a.
      ...(isBoth ? { [COL.materialType]: MATERIAL_TYPE_NONE } : {}),
      ...extra,
    });
    const emit = (out: Record<string, CellValue>, rowType: ExpandedRowType) => {
      const code = text(out[COL.displayCode]);
      const prior = seenExpanded.get(code);
      if (prior === row) {
        warnings.push(
          `${code}: two rows share this code (Material Type Both split); the import keeps the first, Bulk`,
        );
      } else if (prior !== undefined) {
        warnings.push(
          `${code}: written twice (master rows ${prior} and ${row}); the import keeps the first`,
        );
      } else seenExpanded.set(code, row);
      rows.push({ cells: out, rowType, sourceRow: row });
    };

    // A roll-up summarizes what sits under it: the account's typed rows and
    // the accounts beneath it. With one typed row and nothing beneath, it
    // would summarize a single line, so that line stands for the account by
    // itself (and is the account's original row, since no other row is).
    // No typed row at all still gets the roll-up — it is the account's only
    // row then, and dropping it would drop the account.
    const yesCount = COST_TYPE_RULES.filter((r) => flags[r.type]).length;
    const soleLine = yesCount === 1 && !parents.has(displayCode);
    if (soleLine) {
      stats.rollupsSkipped++;
    } else {
      emit(
        typed(ROLLUP_TYPE, {
          [COL.name]: `${name} (*)`,
          [COL.description]: rollupDescription(name),
          [COL.rowType]: "Original",
          [COL.originalRow]: true,
        }),
        "Original",
      );
      stats.originals++;
    }

    for (const rule of COST_TYPE_RULES) {
      if (!flags[rule.type]) continue;
      const base: Record<string, CellValue> = {
        [COL.name]: `${name} (${rule.type})`,
        [COL.gl]: rule.gl,
        [COL.description]: costTypeDescription(rule.noun, name),
        [COL.rowType]: rule.rowType,
        [COL.originalRow]: soleLine,
      };
      if (rule.costClassification) {
        base[COL.costClassification] = rule.costClassification;
      }

      const kinds: readonly (string | null)[] =
        rule.type === "M" && isBoth ? MATERIAL_TYPE_SPLIT : [null];
      if (kinds.length > 1) stats.materialBothSplit++;
      for (const kind of kinds) {
        emit(
          typed(
            rule.type,
            kind === null ? base : { ...base, [COL.materialType]: kind },
          ),
          rule.rowType,
        );
        stats.generated[rule.rowType]++;
      }
    }
  }

  if (expandedInput > 0) {
    problems.unshift(
      `${expandedInput} row(s) already carry a cost-type segment (XXX-XX-XXXX-XX-X): this file is already expanded; point --in at the condensed master`,
    );
  }
  if (costCodeMismatches > 0) {
    warnings.push(
      `${costCodeMismatches} row(s) had a Cost Code that disagreed with the Display Code; the cost code is derived from the Display Code`,
    );
  }
  stats.total = rows.length;
  return { headers, rows, stats, problems, warnings };
}

/**
 * What a CBS tree view can be filtered BY — the cost types, the statuses, and
 * the predicates that answer "does this row qualify?" for one row at a time.
 *
 * The vocabulary, not the filtering: walking a tree with these lives in
 * `prune`. Kept apart because the toolbar buttons, the Excel export and the
 * health checks all need to ask the questions without pruning anything.
 */
import { BACKBONE_TYPE, type CbsTreeItem } from "./types";

/**
 * The cost types a row can carry a companion for.
 *
 * A row counts as one of these two ways: it IS a code of that cost type — its
 * own cost type, which covers both the rows the workbook ships that way and the twins
 * the dictionary generates — or its matching workbook column says YES, meaning
 * a companion of that type exists for it. The badges and the toolbar's filter
 * buttons both ask exactly that question, so they read from this one table
 * rather than repeating the rule once per type.
 *
 * Order is the workbook's own column order, and it is the order the badges and
 * the buttons appear in.
 */
export const CBS_COST_TYPES = [
  {
    key: "labor",
    code: "L",
    flag: "laborCode",
    label: "Labor",
    column: "Labor Code",
  },
  {
    key: "sub",
    code: "S",
    flag: "subReporting",
    label: "Subcontracts",
    column: "Sub Code",
  },
  {
    key: "material",
    code: "M",
    flag: "materialCode",
    label: "Materials",
    column: "Material Code",
  },
  {
    key: "equipment",
    code: "E",
    flag: "equipmentCode",
    label: "Equipment",
    column: "Equipment Code",
  },
  {
    key: "other",
    code: "O",
    flag: "otherCode",
    label: "Other",
    column: "Other Code",
  },
  {
    key: "rental",
    code: "R",
    flag: "rentalCode",
    label: "Rental",
    column: "Rental Code",
  },
] as const satisfies readonly {
  key: string;
  code: string;
  flag: keyof CbsTreeItem;
  label: string;
  column: string;
}[];

export type CbsCostType = (typeof CBS_COST_TYPES)[number];
export type CbsCostTypeKey = CbsCostType["key"];

/**
 * Is `item` a line of this cost type — does its code end in that letter?
 *
 * What every tree's cost-type filter asks. Each tree lists cost LINES, one
 * row per variant, and the flag columns belong to the ACCOUNT rather than the
 * line: reading them would keep an account's "-S" row under a Materials
 * filter, because the account does carry a material code — just not on that
 * line.
 */
export function cbsIsCostType(item: CbsTreeItem, type: CbsCostType): boolean {
  return item.l6 === type.code;
}

/**
 * Does `item` carry this cost type — is it a line of that type, or does its
 * flag column say YES? The export's per-type YES columns, which report what
 * the workbook says the account has, not what the tree is filtered on.
 */
export function cbsHasCostType(item: CbsTreeItem, type: CbsCostType): boolean {
  return cbsIsCostType(item, type) || item[type.flag] === true;
}

/**
 * What a CBS tree view is currently showing: free text plus the cost-type
 * toggles. `query` must already be lower-cased and trimmed.
 */
/**
 * The Status values the workbook uses, as filter buttons.
 *
 * "Retired" is offered although no row carries it today: Status is free text
 * in the workbook, and `cbsIsActive` already treats any non-blank value that
 * is not "Active" as not active, so the day someone types it the filter works
 * without a code change.
 */
export const CBS_STATUSES = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "retired", label: "Retired" },
] as const satisfies readonly { key: string; label: string }[];

export type CbsStatusKey = (typeof CBS_STATUSES)[number]["key"];

export type CbsRowFilter = {
  query: string;
  /**
   * The Cost Classifications to show, each matched exactly against the
   * trimmed cell; a row qualifies on any of them. Empty shows every
   * classification, and `CBS_NO_CLASSIFICATION` stands for a blank cell.
   */
  classifications: readonly string[];
  /** Whether a row came from the workbook or was generated — see `CBS_ROW_TYPE_FILTERS`. */
  rowType: CbsRowTypeFilter;
  /**
   * The Material Types to show among the Materials ("-M") lines, matched like
   * `classifications`. Applies only while the Materials cost type is on, and
   * only to M lines — a Labor line shown beside them is not judged on it.
   */
  materialTypes: readonly string[];
} & Record<CbsCostTypeKey, boolean> &
  Record<CbsStatusKey, boolean>;

/**
 * The Row Type choice: every row, only the original rows, or only the
 * cost-type lines generated from them — per the workbook's "Original Row"
 * column (see `cbsIsGenerated`).
 */
export const CBS_ROW_TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "original", label: "Original" },
  { key: "generated", label: "Generated" },
] as const satisfies readonly { key: string; label: string }[];

export type CbsRowTypeFilter = (typeof CBS_ROW_TYPE_FILTERS)[number]["key"];

export const CBS_FILTER_NONE: CbsRowFilter = {
  query: "",
  classifications: [],
  rowType: "all",
  materialTypes: [],
  ...(Object.fromEntries(CBS_COST_TYPES.map((t) => [t.key, false])) as Record<
    CbsCostTypeKey,
    boolean
  >),
  ...(Object.fromEntries(CBS_STATUSES.map((s) => [s.key, false])) as Record<
    CbsStatusKey,
    boolean
  >),
};

/**
 * Is this the account's backbone row — the one whose cost type is "0"?
 *
 * Every costed variant of an account (its L / S / M / E / O row) hangs off this
 * one, and the backbone carries the flag columns that say which variants
 * exist. A view that lists accounts rather than individual cost lines shows
 * only these, and lets the badges stand in for the rest.
 */
export function cbsIsBackbone(item: CbsTreeItem): boolean {
  return item.l6 === BACKBONE_TYPE;
}

/**
 * The same question asked of a bare display code, for callers holding wire
 * rows — those travel without the level segments (see `withCbsLevels`).
 */
export function cbsIsBackboneCode(displayCode: string): boolean {
  return displayCode.endsWith(`-${BACKBONE_TYPE}`);
}

/**
 * Whether a row is live enough to show on the Code Book and the Project Cost
 * Code List. The CBS Dictionary ignores this and lists everything.
 *
 * The workbook's Status column holds "Active", "Inactive" or nothing at all.
 * A BLANK counts as active: the 23 Inactive rows are all "(Reserved)"
 * placeholders somebody deliberately parked, while the ~190 blanks are
 * ordinary accounts whose cell was never filled in — including section
 * summaries, so hiding them would take their children's parents with them.
 * Anything else non-blank is treated as not active, so a status added to the
 * workbook later ("Retired", say) hides itself without needing code.
 */
export function cbsIsActive(status: string | null | undefined): boolean {
  const value = status?.trim();
  return !value || value.toLowerCase() === "active";
}

/**
 * Does this row carry the status that button stands for?
 *
 * "Active" also takes a blank cell, for the same reason `cbsIsActive` does —
 * roughly 190 live accounts have no Status, section summaries among them.
 */
export function cbsHasStatus(item: CbsTreeItem, key: CbsStatusKey): boolean {
  if (key === "active") return cbsIsActive(item.status);
  return (item.status ?? "").trim().toLowerCase() === key;
}

/** An all-off cost-type selection — the state both tree views start in. */
export function cbsNoCostTypes(): Record<CbsCostTypeKey, boolean> {
  return Object.fromEntries(
    CBS_COST_TYPES.map((t) => [t.key, false]),
  ) as Record<CbsCostTypeKey, boolean>;
}

/** An all-off status selection. */
export function cbsNoStatuses(): Record<CbsStatusKey, boolean> {
  return Object.fromEntries(CBS_STATUSES.map((s) => [s.key, false])) as Record<
    CbsStatusKey,
    boolean
  >;
}

/** Whether any cost-type button is pressed, text search aside. */
export function cbsHasCostTypeFilter(filter: CbsRowFilter): boolean {
  return CBS_COST_TYPES.some((t) => filter[t.key]);
}

/** Whether any status button is pressed. */
export function cbsHasStatusFilter(filter: CbsRowFilter): boolean {
  return CBS_STATUSES.some((s) => filter[s.key]);
}

/** Whether any Cost Classification is picked. */
export function cbsHasClassificationFilter(filter: CbsRowFilter): boolean {
  return filter.classifications.length > 0;
}

/**
 * The classification value standing for a blank cell — about 430 rows, the
 * division roots among them, have none.
 */
export const CBS_NO_CLASSIFICATION = "";

/**
 * A row's Cost Classification as the filter reads it: the trimmed cell, or
 * `CBS_NO_CLASSIFICATION` when blank. Not case-folded — the workbook's values
 * are what the dropdown lists, so "INDIRECT" and "Indirects" stay apart until
 * the workbook reconciles them.
 */
export function cbsClassificationOf(item: CbsTreeItem): string {
  return item.costClassification?.trim() ?? CBS_NO_CLASSIFICATION;
}

/** One picker entry: a value and how many rows carry it. */
export type CbsValueOption = { value: string; count: number };

/** The blank-cell entry; shared by every free-text picker. */
export const CBS_BLANK_VALUE = CBS_NO_CLASSIFICATION;

/**
 * The values of one free-text column present in `items`, for a picker —
 * alphabetical, with the blank entry last. Built from the rows a view lists,
 * so it never offers a value that could only filter to nothing. Context rows
 * are skipped, as they are in the row counts.
 */
function cbsValueOptions(
  items: Iterable<CbsTreeItem>,
  valueOf: (item: CbsTreeItem) => string,
  include: (item: CbsTreeItem) => boolean = () => true,
): CbsValueOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.context || !include(item)) continue;
    const value = valueOf(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) =>
      a.value === CBS_BLANK_VALUE
        ? 1
        : b.value === CBS_BLANK_VALUE
          ? -1
          : a.value.localeCompare(b.value, undefined, { sensitivity: "base" }),
    );
}

/** The Cost Classifications present in `items` — see `cbsValueOptions`. */
export function cbsClassificationOptions(
  items: Iterable<CbsTreeItem>,
): CbsValueOption[] {
  return cbsValueOptions(items, cbsClassificationOf);
}

/**
 * Was this row generated rather than original? The workbook says so in its
 * "Original Row" column (`isOriginal`); a row imported before that column
 * existed falls back to `rowType`, where only the dictionary's own S / M twins
 * read as generated.
 */
export function cbsIsGenerated(item: CbsTreeItem): boolean {
  if (item.isOriginal != null) return !item.isOriginal;
  return item.rowType !== "ORIGINAL";
}

/** Does this row pass the Row Type choice? */
export function cbsMatchesRowType(
  item: CbsTreeItem,
  rowType: CbsRowTypeFilter,
): boolean {
  if (rowType === "all") return true;
  return rowType === "generated" ? cbsIsGenerated(item) : !cbsIsGenerated(item);
}

/** Whether the Row Type choice narrows anything. */
export function cbsHasRowTypeFilter(filter: CbsRowFilter): boolean {
  return filter.rowType !== "all";
}

/**
 * A row's Material Type as the filter reads it: the trimmed cell, or the
 * blank entry. Exact, like classifications — the workbook's "Consumable" and
 * "Consumables" stay apart until it reconciles them.
 */
export function cbsMaterialTypeOf(item: CbsTreeItem): string {
  return item.materialType?.trim() ?? CBS_BLANK_VALUE;
}

const MATERIALS = CBS_COST_TYPES.find((t) => t.key === "material")!;

/** The Material Types on the Materials ("-M") lines in `items`. */
export function cbsMaterialTypeOptions(
  items: Iterable<CbsTreeItem>,
): CbsValueOption[] {
  return cbsValueOptions(items, cbsMaterialTypeOf, (i) =>
    cbsIsCostType(i, MATERIALS),
  );
}

/**
 * Whether the Material Type picker narrows anything: it is only in force
 * while Materials is on, so a stale pick can't hide rows after it is off.
 */
export function cbsHasMaterialTypeFilter(filter: CbsRowFilter): boolean {
  return filter.material && filter.materialTypes.length > 0;
}

/**
 * Does this row pass the Material Type picker? Only M lines are judged on it,
 * so pressing Labor as well keeps every Labor line.
 */
export function cbsMatchesMaterialType(
  item: CbsTreeItem,
  filter: CbsRowFilter,
): boolean {
  if (!cbsHasMaterialTypeFilter(filter)) return true;
  if (!cbsIsCostType(item, MATERIALS)) return true;
  return filter.materialTypes.includes(cbsMaterialTypeOf(item));
}

/** Is this filter showing everything (so callers can skip the walk)? */
export function cbsFilterIsEmpty(filter: CbsRowFilter): boolean {
  return (
    !filter.query &&
    !cbsHasCostTypeFilter(filter) &&
    !cbsHasStatusFilter(filter) &&
    !cbsHasClassificationFilter(filter) &&
    !cbsHasRowTypeFilter(filter) &&
    !cbsHasMaterialTypeFilter(filter)
  );
}

/**
 * Splits a query into the terms every row must carry.
 *
 * Whitespace-separated and order-free, so "rental pipe" finds "Pipe Shop
 * Third Party Rental" — one substring over the whole haystack would not, and
 * nobody types an account's words in the order the workbook has them.
 *
 * Computed once per filter rather than per row: at ~12,000 rows a split per
 * row per keystroke is the difference between instant and noticeable.
 */
export function cbsQueryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

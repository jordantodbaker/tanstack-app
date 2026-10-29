/**
 * What a CBS tree view can be filtered BY — the cost types, the statuses, the
 * value pickers, and the predicates that answer "does this row qualify?" for
 * one row at a time.
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

/**
 * The value standing for a blank cell in every value picker — about 430 rows
 * have no Cost Classification, the division roots among them.
 */
export const CBS_BLANK_VALUE = "";
/** The older name for the same thing. */
export const CBS_NO_CLASSIFICATION = CBS_BLANK_VALUE;

/** One picker entry: a value and how many rows carry it. */
export type CbsValueOption = { value: string; count: number };

/**
 * The value pickers: multi-selects over one free-text workbook column each.
 *
 * Every picker is the same machinery — a list of ticked values, a row
 * qualifying on any of them, the blank cell as its own entry, an option list
 * counted from the rows a view lists — so they live in one table and the
 * hook, the toolbar, the prune walk and the export's filter note each loop
 * over it. Adding a picker is adding a row here (plus the wire schema in
 * `cbsExport`, which is written out by hand on purpose).
 *
 * Values are matched exactly against the trimmed cell, not case-folded: the
 * workbook's own spellings are what the picker lists, so "INDIRECT" and
 * "Indirects" stay apart until the workbook reconciles them.
 */
export type CbsValueFilter = {
  /** The field on `CbsRowFilter` holding the picked values. */
  key: CbsValueFilterKey;
  /** "Cost classification" — the picker's caption and accessible name. */
  label: string;
  /** "classifications" — for "All classifications" / "3 classifications". */
  plural: string;
  /** "cost classification" — how the export's filter note names it. */
  note: string;
  /**
   * Where the picker sits in the toolbar: before the cost-type buttons (a
   * filter the others are usually asked within) or after them.
   */
  placement: "before-cost-types" | "after-cost-types";
  /** The cell the picker reads, trimmed; a blank is `CBS_BLANK_VALUE`. */
  valueOf: (item: CbsTreeItem) => string;
  /**
   * Which rows the picker judges and counts. Rows it does not apply to pass
   * regardless — a Labor line beside the Materials lines is not judged on its
   * Material Type. Omitted: every row.
   */
  appliesTo?: (item: CbsTreeItem) => boolean;
  /**
   * A cost type the picker belongs to: it is offered, and in force, only
   * while that cost type is on, so a stale pick cannot hide rows after the
   * type is turned off.
   */
  requiresCostType?: CbsCostTypeKey;
};

export type CbsValueFilterKey =
  "disciplines" | "materialTypes" | "classifications";

const MATERIALS = CBS_COST_TYPES.find((t) => t.key === "material")!;

/** A picker over one cell: trimmed, with blank read as the blank entry. */
const cellOf =
  (read: (item: CbsTreeItem) => string | null | undefined) =>
  (item: CbsTreeItem): string =>
    read(item)?.trim() ?? CBS_BLANK_VALUE;

/** In toolbar order within each placement. */
export const CBS_VALUE_FILTERS: readonly CbsValueFilter[] = [
  {
    key: "disciplines",
    label: "Discipline",
    plural: "disciplines",
    note: "discipline",
    placement: "before-cost-types",
    valueOf: cellOf((i) => i.discipline),
  },
  {
    key: "materialTypes",
    label: "Material type",
    plural: "material types",
    note: "material type",
    placement: "after-cost-types",
    valueOf: cellOf((i) => i.materialType),
    appliesTo: (i) => cbsIsCostType(i, MATERIALS),
    requiresCostType: "material",
  },
  {
    key: "classifications",
    label: "Cost classification",
    plural: "classifications",
    note: "cost classification",
    placement: "after-cost-types",
    valueOf: cellOf((i) => i.costClassification),
  },
];

/**
 * What a CBS tree view is currently showing: free text, the cost-type and
 * status toggles, the Row Type choice, and the values picked in each value
 * picker (empty for all; `CBS_BLANK_VALUE` stands for a blank cell). `query`
 * must already be lower-cased and trimmed.
 */
export type CbsRowFilter = {
  query: string;
  /** Whether a row came from the workbook or was generated — see `CBS_ROW_TYPE_FILTERS`. */
  rowType: CbsRowTypeFilter;
} & Record<CbsValueFilterKey, readonly string[]> &
  Record<CbsCostTypeKey, boolean> &
  Record<CbsStatusKey, boolean>;

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

/** Nothing picked in any value picker. */
export function cbsNoValues(): Record<CbsValueFilterKey, string[]> {
  const none = {} as Record<CbsValueFilterKey, string[]>;
  for (const v of CBS_VALUE_FILTERS) none[v.key] = [];
  return none;
}

export const CBS_FILTER_NONE: CbsRowFilter = {
  query: "",
  rowType: "all",
  ...cbsNoValues(),
  ...cbsNoCostTypes(),
  ...cbsNoStatuses(),
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

/** Whether any cost-type button is pressed, text search aside. */
export function cbsHasCostTypeFilter(filter: CbsRowFilter): boolean {
  return CBS_COST_TYPES.some((t) => filter[t.key]);
}

/** Whether any status button is pressed. */
export function cbsHasStatusFilter(filter: CbsRowFilter): boolean {
  return CBS_STATUSES.some((s) => filter[s.key]);
}

/**
 * Whether this picker narrows anything: something is picked, and the cost
 * type it belongs to (if any) is on.
 */
export function cbsValueFilterInForce(
  filter: CbsRowFilter,
  picker: CbsValueFilter,
): boolean {
  if (filter[picker.key].length === 0) return false;
  return !picker.requiresCostType || filter[picker.requiresCostType];
}

/** Whether any value picker narrows anything. */
export function cbsHasValueFilter(filter: CbsRowFilter): boolean {
  return CBS_VALUE_FILTERS.some((v) => cbsValueFilterInForce(filter, v));
}

/**
 * Does this row pass the picker? Rows the picker does not apply to pass, so
 * pressing Labor beside Materials keeps every Labor line whatever Material
 * Types are ticked.
 */
export function cbsMatchesValueFilter(
  item: CbsTreeItem,
  filter: CbsRowFilter,
  picker: CbsValueFilter,
): boolean {
  if (!cbsValueFilterInForce(filter, picker)) return true;
  if (picker.appliesTo && !picker.appliesTo(item)) return true;
  return filter[picker.key].includes(picker.valueOf(item));
}

/**
 * Every picker's option list for one view, from the rows it lists —
 * alphabetical, with the blank entry last — so a picker never offers a value
 * that could only filter to nothing. Context rows are skipped, as they are in
 * the row counts. One pass over the rows for all the pickers: the catalog
 * views hold ~14,000 of them.
 */
export function cbsValueFilterOptions(
  items: Iterable<CbsTreeItem>,
): Record<CbsValueFilterKey, CbsValueOption[]> {
  const counts = new Map<CbsValueFilterKey, Map<string, number>>(
    CBS_VALUE_FILTERS.map((v) => [v.key, new Map()]),
  );
  for (const item of items) {
    if (item.context) continue;
    for (const picker of CBS_VALUE_FILTERS) {
      if (picker.appliesTo && !picker.appliesTo(item)) continue;
      const tally = counts.get(picker.key)!;
      const value = picker.valueOf(item);
      tally.set(value, (tally.get(value) ?? 0) + 1);
    }
  }
  const sorted = (tally: Map<string, number>): CbsValueOption[] =>
    [...tally]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) =>
        a.value === CBS_BLANK_VALUE
          ? 1
          : b.value === CBS_BLANK_VALUE
            ? -1
            : a.value.localeCompare(b.value, undefined, {
                sensitivity: "base",
              }),
      );
  return Object.fromEntries(
    [...counts].map(([key, tally]) => [key, sorted(tally)]),
  ) as Record<CbsValueFilterKey, CbsValueOption[]>;
}

/**
 * Was this row generated rather than original? The workbook says so in its
 * "Original Row" column (`isOriginal`). A row imported before that column
 * existed is read by its cost type: the expanded sheet generates every typed
 * line from an account's "-0" row, so only the backbone is original.
 */
export function cbsIsGenerated(item: CbsTreeItem): boolean {
  if (item.isOriginal != null) return !item.isOriginal;
  return !cbsIsBackbone(item);
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

/** Is this filter showing everything (so callers can skip the walk)? */
export function cbsFilterIsEmpty(filter: CbsRowFilter): boolean {
  return (
    !filter.query &&
    !cbsHasCostTypeFilter(filter) &&
    !cbsHasStatusFilter(filter) &&
    !cbsHasRowTypeFilter(filter) &&
    !cbsHasValueFilter(filter)
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

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
 * rather than repeating the rule five times.
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
 * How a view reads "does this row carry cost type M?".
 *
 * `codeOrFlag` — the row IS an M code, or its Material Code column says YES.
 * Right for a list of ACCOUNTS: the Cost Accounts view shows only the "-0"
 * backbone rows, whose own cost type is 0, so the flag columns are the only
 * thing that can answer for them.
 *
 * `code` — the row's own cost type, and nothing else. Right for a list of COST
 * LINES: the CBS Dictionary puts every variant on its own row, and there the
 * flags belong to the account rather than the row. Reading them would keep an
 * account's "-S" row under a Materials filter, because the account does carry
 * a material code — just not on that line.
 */
export type CbsCostTypeMatch = "code" | "codeOrFlag";

/** Does `item` carry this cost type? See {@link CbsCostTypeMatch}. */
export function cbsHasCostType(
  item: CbsTreeItem,
  type: CbsCostType,
  match: CbsCostTypeMatch = "codeOrFlag",
): boolean {
  if (item.l6 === type.code) return true;
  return match === "codeOrFlag" && item[type.flag] === true;
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

export type CbsRowFilter = { query: string } & Record<CbsCostTypeKey, boolean> &
  Record<CbsStatusKey, boolean>;

export const CBS_FILTER_NONE: CbsRowFilter = {
  query: "",
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

/** Is this filter showing everything (so callers can skip the walk)? */
export function cbsFilterIsEmpty(filter: CbsRowFilter): boolean {
  return (
    !filter.query &&
    !cbsHasCostTypeFilter(filter) &&
    !cbsHasStatusFilter(filter)
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

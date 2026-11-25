import { cbsActiveRows } from "./cbs-tree";

/**
 * The CBS views, defined once: what each is called, which rows it lists, which
 * extra filters it offers, and where it lives. The page sections, the
 * full-screen tab and the Excel export all read this table, so a view cannot
 * mean one thing on screen and another in the file.
 *
 * Every view offers the common filters (search, cost types, discipline, …);
 * only what differs is here. To give a view another filter, add its flag here
 * and read it in `CbsDictionaryBrowser`.
 */
export const CBS_VIEW_KEYS = ["project", "accounts", "dictionary"] as const;
export type CbsView = (typeof CBS_VIEW_KEYS)[number];
/** The views over the whole catalog, for administrators. */
export type CbsCatalogView = Exclude<CbsView, "project">;

export function isCbsView(v: unknown): v is CbsView {
  return (CBS_VIEW_KEYS as readonly unknown[]).includes(v);
}

/**
 * Which codes the Dictionary lists: the CBS, the retired phase codes from
 * before it, or one after the other. A choice of list rather than a filter on
 * one, so Clear filters leaves it alone.
 */
export const CBS_CODE_SETS = ["current", "legacy", "both"] as const;
export type CbsCodeSet = (typeof CBS_CODE_SETS)[number];

export const CBS_CODE_SET_LABELS: Record<
  CbsCodeSet,
  { label: string; title: string }
> = {
  current: { label: "Current", title: "The CBS, without the legacy codes" },
  legacy: {
    label: "Legacy",
    title:
      "Only the retired phase codes from before this CBS. Reference only — they cannot be granted or booked to.",
  },
  both: { label: "Both", title: "The CBS, then the legacy codes after it" },
};

export function isCbsCodeSet(v: unknown): v is CbsCodeSet {
  return (CBS_CODE_SETS as readonly unknown[]).includes(v);
}

/** A row as far as choosing rows for a view goes. */
type ViewRow = { displayCode: string; status: string | null };

export type CbsViewDef = {
  /** The heading. */
  title: string;
  /** Section subtitle, where the view is one of several on a page. */
  description: string;
  sourceNote: string;
  emptyMessage: string;
  errorMessage: string;
  /** The page that reads `?code=` — what "Copy link" points at. */
  linkPath: string;
  /**
   * The rows this view lists, from the rows its query returns. The project
   * view's are already cut to the project's grants by the server.
   */
  rows: <T extends ViewRow>(items: T[]) => (T & { context?: boolean })[];
  /** Offer Active / Inactive / Retired. The other views are active-only. */
  statusFilter: boolean;
  /** Offer All / Original / Generated. */
  rowTypeFilter: boolean;
  /** Offer Current / Legacy / Both — see `CBS_CODE_SETS`. */
  legacyFilter: boolean;
  /** The grayed-out parents: what the toggle that hides them says, and what
   *  the export's Scope line adds when they are hidden. */
  context: { label: string; title: string; hiddenNote: string };
  export: {
    /** Sheet name. */
    sheet: string;
    /** Filename stem. */
    filename: string;
    /** The Scope line. */
    scope: string;
  };
};

/**
 * `cbsActiveRows`, remembered per input array: the Code Book asks for the same
 * rows twice, for the section's count and for its tree. The array is the
 * query cache's, which is replaced rather than mutated.
 */
const ACTIVE_ROWS = new WeakMap<object, unknown>();
function activeRowsOnce<T extends ViewRow>(
  items: T[],
): (T & { context?: boolean })[] {
  let rows = ACTIVE_ROWS.get(items) as
    (T & { context?: boolean })[] | undefined;
  if (!rows) {
    rows = cbsActiveRows(items);
    ACTIVE_ROWS.set(items, rows);
  }
  return rows;
}

const CATALOG = {
  sourceNote:
    "Source: the CBS Dictionary, in full — no project allow-list applied. Colors mirror the source workbook's outline levels.",
  emptyMessage: "No CBS items in the catalog.",
  errorMessage: "Failed to load the CBS Code Book.",
  linkPath: "/admin/master-cbs",
  context: {
    label: "Hide inactive parents",
    title:
      "Hide the grayed-out parent summaries that are Inactive or Retired. The active codes under them move up to the nearest active parent.",
    hiddenNote: "inactive parents hidden",
  },
};
const CATALOG_SCOPE = "Whole catalog — no project allow-list applied";

export const CBS_VIEWS: Record<CbsView, CbsViewDef> = {
  project: {
    title: "Project Cost Code List",
    description: "The cost codes available on this project.",
    sourceNote:
      "Source: the CBS Dictionary, limited to the items selected for this project on the Setup page. Colors mirror the source workbook's outline levels.",
    emptyMessage: "No cost codes selected for this project.",
    errorMessage: "Failed to load this project's cost codes.",
    linkPath: "/project-cost-codes",
    rows: (items) => items,
    statusFilter: false,
    rowTypeFilter: false,
    legacyFilter: false,
    context: {
      label: "Hide ungranted parents",
      title:
        "Hide the grayed-out parent summaries this project was not granted. The codes under them move up to the nearest parent it does have.",
      hiddenNote: "ungranted parents hidden",
    },
    export: {
      sheet: "Project Cost Codes",
      filename: "project-cost-code-list",
      scope: "Codes granted to this project on the Setup page",
    },
  },
  accounts: {
    ...CATALOG,
    title: "Cost Accounts",
    description:
      "Every active code, each cost type on its own line. Inactive and retired codes are listed in the CBS Dictionary below.",
    // The same rows as the Dictionary minus anything Inactive or Retired: the
    // list people pick codes from. Inactive parents of active rows stay,
    // muted, so the hierarchy holds.
    rows: activeRowsOnce,
    statusFilter: false,
    rowTypeFilter: false,
    legacyFilter: false,
    export: {
      sheet: "Cost Accounts",
      filename: "cbs-cost-accounts",
      scope: CATALOG_SCOPE,
    },
  },
  dictionary: {
    ...CATALOG,
    title: "CBS Dictionary",
    description:
      "Every row in the CBS, each cost type on its own line — active, inactive and retired, with a Status filter to narrow them.",
    // Everything, so nothing becomes unfindable by being hidden elsewhere.
    rows: (items) => items,
    statusFilter: true,
    rowTypeFilter: true,
    legacyFilter: true,
    export: {
      sheet: "CBS Dictionary",
      filename: "cbs-dictionary",
      scope: CATALOG_SCOPE,
    },
  },
};

import { defaultStringifySearch } from "@tanstack/react-router";
import {
  CBS_COST_TYPES,
  CBS_ROW_TYPE_FILTERS,
  CBS_STATUSES,
  CBS_VALUE_FILTERS,
  cbsNoCostTypes,
  cbsNoStatuses,
  cbsNoValues,
  type CbsCostTypeKey,
  type CbsRowFilterState,
  type CbsRowTypeFilter,
  type CbsStatusKey,
  type CbsValueFilterKey,
} from "./cbs-tree";

/**
 * The full-screen CBS tab: one route, `/cbs-fullscreen`, that renders a CBS
 * tree with none of the app's navigation around it, so the whole window is
 * the tree. Which tree, and everything its toolbar held when the tab was
 * opened — search text, cost types, pickers, statuses, Row Type, the
 * ungranted-parents checkbox, the selected row — travel in the URL, so the
 * tab opens where the page left off and the link can be bookmarked.
 *
 * Pure: the URL shape and the two conversions, so the button that builds the
 * link and the route that reads it cannot disagree. Serialised with the
 * router's own search stringifier, which is what `validateSearch` parses.
 */

export const CBS_FULLSCREEN_PATH = "/cbs-fullscreen";

/** Is this the full-screen route? The shell drops its chrome for it. */
export function isCbsFullscreenPath(pathname: string): boolean {
  return pathname === CBS_FULLSCREEN_PATH;
}

/**
 * Which tree: the selected project's cost codes, the active Cost Accounts of
 * the whole catalog, or the whole CBS Dictionary with every status. The last
 * two are the Admin → Master CBS sections, so they need an administrator.
 */
export const CBS_FULLSCREEN_VIEWS = [
  "project",
  "accounts",
  "dictionary",
] as const;
export type CbsFullscreenView = (typeof CBS_FULLSCREEN_VIEWS)[number];

export function isCbsFullscreenView(v: unknown): v is CbsFullscreenView {
  return (CBS_FULLSCREEN_VIEWS as readonly unknown[]).includes(v);
}

/** The route's search params. Only what differs from the defaults is written. */
export type CbsFullscreenSearch = {
  view: CbsFullscreenView;
  /** The search box, as typed. */
  q?: string;
  /** The cost-type buttons that are on. */
  types?: CbsCostTypeKey[];
  /** The status buttons that are on (Dictionary only). */
  statuses?: CbsStatusKey[];
  rowType?: CbsRowTypeFilter;
  /** "Hide ungranted parents" (project view only). */
  hideContext?: boolean;
  /** The selected row — opened as the `?code=` deep link is. */
  code?: string;
} & Partial<Record<CbsValueFilterKey, string[]>>;

const COST_TYPE_KEYS = new Set<string>(CBS_COST_TYPES.map((t) => t.key));
const STATUS_KEYS = new Set<string>(CBS_STATUSES.map((s) => s.key));
const ROW_TYPES = new Set<string>(CBS_ROW_TYPE_FILTERS.map((r) => r.key));

/**
 * Read the route's search leniently: anything malformed is dropped rather
 * than failing the page, as the `?code=` routes do, and a missing or unknown
 * view falls back to the project's codes.
 */
export function parseCbsFullscreenSearch(
  search: Record<string, unknown>,
): CbsFullscreenSearch {
  const out: CbsFullscreenSearch = {
    view: isCbsFullscreenView(search.view) ? search.view : "project",
  };
  const text = (v: unknown): string | undefined =>
    typeof v === "string" && v !== "" ? v : undefined;
  const list = <T extends string>(
    v: unknown,
    accept: (s: string) => s is T,
  ): T[] | undefined => {
    const raw = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    const kept = raw.filter((x): x is T => typeof x === "string" && accept(x));
    return kept.length > 0 ? kept : undefined;
  };
  const any = (s: string): s is string => s !== "";

  const q = text(search.q);
  if (q !== undefined) out.q = q;
  const types = list(search.types, (s): s is CbsCostTypeKey =>
    COST_TYPE_KEYS.has(s),
  );
  if (types) out.types = types;
  const statuses = list(search.statuses, (s): s is CbsStatusKey =>
    STATUS_KEYS.has(s),
  );
  if (statuses) out.statuses = statuses;
  if (
    typeof search.rowType === "string" &&
    search.rowType !== "all" &&
    ROW_TYPES.has(search.rowType)
  ) {
    out.rowType = search.rowType as CbsRowTypeFilter;
  }
  for (const picker of CBS_VALUE_FILTERS) {
    const picked = list(search[picker.key], any);
    if (picked) out[picker.key] = picked;
  }
  if (search.hideContext === true) out.hideContext = true;
  const code = text(search.code);
  if (code !== undefined) out.code = code;
  return out;
}

/**
 * The search for a tab opened from a tree in this state. Defaults are left
 * out, so a tree with nothing filtering opens with a bare `?view=`.
 */
export function cbsFullscreenSearch(
  view: CbsFullscreenView,
  state: CbsRowFilterState,
  extras: { hideContext?: boolean; code?: string | null } = {},
): CbsFullscreenSearch {
  const out: CbsFullscreenSearch = { view };
  if (state.query.trim() !== "") out.q = state.query;
  const types = CBS_COST_TYPES.map((t) => t.key).filter(
    (k) => state.costTypes[k],
  );
  if (types.length > 0) out.types = types;
  const statuses = CBS_STATUSES.map((s) => s.key).filter(
    (k) => state.statuses[k],
  );
  if (statuses.length > 0) out.statuses = statuses;
  if (state.rowType !== "all") out.rowType = state.rowType;
  for (const picker of CBS_VALUE_FILTERS) {
    const picked = state.values[picker.key];
    if (picked.length > 0) out[picker.key] = [...picked];
  }
  if (extras.hideContext) out.hideContext = true;
  if (extras.code) out.code = extras.code;
  return out;
}

/** The href for `search` — the path plus the router's own query encoding. */
export function cbsFullscreenHref(search: CbsFullscreenSearch): string {
  return `${CBS_FULLSCREEN_PATH}${defaultStringifySearch(search)}`;
}

/** The toolbar state a tab should start in, from its search. */
export function cbsRowFilterStateFromSearch(
  search: CbsFullscreenSearch,
): CbsRowFilterState {
  const costTypes = cbsNoCostTypes();
  for (const k of search.types ?? []) costTypes[k] = true;
  const statuses = cbsNoStatuses();
  for (const k of search.statuses ?? []) statuses[k] = true;
  const values = cbsNoValues();
  for (const picker of CBS_VALUE_FILTERS) {
    values[picker.key] = [...(search[picker.key] ?? [])];
  }
  return {
    query: search.q ?? "",
    rowType: search.rowType ?? "all",
    values,
    costTypes,
    statuses,
  };
}

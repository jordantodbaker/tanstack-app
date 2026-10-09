/**
 * Catalog of entity types that can show up in the user's Recently Viewed
 * sidebar. Single source of truth for:
 *   - the runtime string set (Zod validators read this)
 *   - the display label per entity (sidebar rows)
 *   - the list route per entity (clicking a recent navigates here with `?q=…`)
 *
 * Adding a new entity to the recents flow:
 *   1. Add it to `RECENT_ENTITY_TYPES` below.
 *   2. Add the matching label + route entries.
 *   3. Wire `useRecordRecentView` into that entity's dialog body component.
 *   4. The drift-guard test pins this list against the audit/comment/
 *      attachment entity-type catalogs so the four stay aligned.
 */

export const RECENT_ENTITY_TYPES = [
  "ChangeLog",
  "FieldChangeOrder",
  "Rfi",
  "Trend",
  "Pco",
] as const;

export type RecentEntityType = (typeof RECENT_ENTITY_TYPES)[number];

/** Short noun shown in the sidebar (e.g. "CVR-014" / "FCO-098"). */
export const RECENT_ENTITY_LABELS: Record<RecentEntityType, string> = {
  ChangeLog: "CVR",
  FieldChangeOrder: "FCO",
  Rfi: "RFI",
  Trend: "Trend",
  Pco: "PCO",
};

/** List route a click on a recent item navigates to. The destination route
 *  reads `?q` via its `validateSearch` and pre-filters the table to that
 *  record's number — one more click on the row opens the dialog. */
export const RECENT_ENTITY_ROUTES: Record<
  RecentEntityType,
  "/changelog" | "/fco-log" | "/rfis" | "/trends" | "/pco"
> = {
  ChangeLog: "/changelog",
  FieldChangeOrder: "/fco-log",
  Rfi: "/rfis",
  Trend: "/trends",
  Pco: "/pco",
};

/** Most we ever store in the user's prefs. Keeping headroom past the
 *  display cap so project-filtering doesn't run out of items immediately. */
export const RECENTS_MAX_STORED = 20;

/**
 * Most we ever render in the sidebar.
 *
 * Ten rather than five because the list now follows the Change Log's five nav
 * links instead of being pinned to the bottom of the column: there is real
 * room under it, and 20 are stored, so a shorter list was leaving both the
 * space and the data unused. The nav scrolls when it doesn't fit.
 */
export const RECENTS_MAX_DISPLAYED = 10;

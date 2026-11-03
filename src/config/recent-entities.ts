import {
  CHANGE_ENTITIES,
  CHANGE_ENTITY_TYPES,
  type ChangeEntityType,
} from "./change-entities";

/**
 * The entity types that can show up in the user's Recently Viewed sidebar:
 * the five change-pipeline records, read off `CHANGE_ENTITIES` so the set,
 * the labels and the routes cannot drift from the comments, attachments and
 * numbering catalogs that derive from the same table.
 *
 * Adding a new entity to the recents flow is adding it to `CHANGE_ENTITIES`
 * and wiring `useRecordRecentView` into that entity's dialog body.
 */

export const RECENT_ENTITY_TYPES = CHANGE_ENTITY_TYPES;

export type RecentEntityType = ChangeEntityType;

/** Short noun shown in the sidebar (e.g. "CVR-014" / "FCO-098"). */
export const RECENT_ENTITY_LABELS: Record<RecentEntityType, string> =
  Object.fromEntries(
    CHANGE_ENTITY_TYPES.map((t) => [t, CHANGE_ENTITIES[t].noun]),
  ) as Record<RecentEntityType, string>;

/** List route a click on a recent item navigates to. The destination route
 *  reads `?q` via its `validateSearch` and pre-filters the table to that
 *  record's number — one more click on the row opens the dialog. */
export const RECENT_ENTITY_ROUTES: Record<
  RecentEntityType,
  "/changelog" | "/fco-log" | "/rfis" | "/trends" | "/pco"
> = Object.fromEntries(
  CHANGE_ENTITY_TYPES.map((t) => [t, CHANGE_ENTITIES[t].listPath]),
) as Record<
  RecentEntityType,
  "/changelog" | "/fco-log" | "/rfis" | "/trends" | "/pco"
>;

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

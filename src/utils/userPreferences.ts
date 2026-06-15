import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  getAccessibleProjectIds,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import {
  parseRecordRecentView,
  parseUpdateDashboardPrefs,
} from "~/lib/validators";
import {
  RECENTS_MAX_STORED,
  RECENT_ENTITY_TYPES,
  type RecentEntityType,
} from "~/config/recent-entities";

/**
 * Per-user preferences server fns. Today: the dashboard customize dialog's
 * hidden-widget list. The prefs row stores a single JSON blob keyed by
 * feature (`prefs.dashboard.hiddenWidgets[]`) so future preferences can be
 * added without a schema migration; readers just default missing branches
 * to a sensible empty value.
 *
 * All reads + writes are scoped to the currently-signed-in user; admins
 * don't manage other users' prefs through this surface.
 */

export type DashboardPrefs = {
  hiddenWidgets: string[];
  /** Ordered widget ids; empty array means "use catalog order". */
  widgetOrder: string[];
};

type StoredPrefs = {
  dashboard?: { hiddenWidgets?: unknown; widgetOrder?: unknown };
  recentlyViewed?: unknown;
};

const EMPTY_DASHBOARD_PREFS: DashboardPrefs = {
  hiddenWidgets: [],
  widgetOrder: [],
};

const stringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

/** Narrow a `Json` value to the dashboard-prefs shape. Any malformed branch
 *  (manually-edited DB, schema drift, etc.) defaults to empty rather than
 *  exploding — the catalog is the source of truth, not stored prefs. */
function extractDashboardPrefs(raw: unknown): DashboardPrefs {
  if (typeof raw !== "object" || raw === null) return EMPTY_DASHBOARD_PREFS;
  const dashboard = (raw as StoredPrefs).dashboard;
  if (typeof dashboard !== "object" || dashboard === null) {
    return EMPTY_DASHBOARD_PREFS;
  }
  return {
    hiddenWidgets: stringArray(dashboard.hiddenWidgets),
    widgetOrder: stringArray(dashboard.widgetOrder),
  };
}

export const fetchUserDashboardPrefs = createServerFn({
  method: "GET",
}).handler(async (): Promise<DashboardPrefs> => {
  const actor = await resolveCurrentUser();
  if (!actor) return EMPTY_DASHBOARD_PREFS;
  const row = await prisma.userPreference.findUnique({
    where: { userId: actor.id },
    select: { prefs: true },
  });
  if (!row) return EMPTY_DASHBOARD_PREFS;
  return extractDashboardPrefs(row.prefs);
});

export const userDashboardPrefsQueryOptions = () =>
  queryOptions({
    queryKey: ["userDashboardPrefs"],
    queryFn: () => fetchUserDashboardPrefs(),
    // Tiny payload, often-read; cache forever and let the mutation
    // invalidate it on save.
    staleTime: Infinity,
  });

export const updateUserDashboardPrefs = createServerFn({ method: "POST" })
  .inputValidator(parseUpdateDashboardPrefs)
  .handler(async ({ data }): Promise<DashboardPrefs> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");

    // Merge into the existing JSON blob so other prefs (theme, density, …)
    // we add later aren't clobbered by a dashboard save. The dashboard
    // branch is fully replaced — `hiddenWidgets` is the authoritative
    // client-sent list.
    const existing = await prisma.userPreference.findUnique({
      where: { userId: actor.id },
      select: { prefs: true },
    });
    const merged = {
      ...(typeof existing?.prefs === "object" && existing.prefs !== null
        ? (existing.prefs as object)
        : {}),
      dashboard: {
        hiddenWidgets: data.hiddenWidgets,
        widgetOrder: data.widgetOrder,
      },
    };

    await prisma.userPreference.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, prefs: merged },
      update: { prefs: merged },
    });

    return {
      hiddenWidgets: data.hiddenWidgets,
      widgetOrder: data.widgetOrder,
    };
  });

// ── Recently viewed ─────────────────────────────────────────────────────────

export type RecentItem = {
  entityType: RecentEntityType;
  entityId: number;
  projectId: number;
  /** Denormalized number (cvrNumber/fcoNumber/…), or "" if the record was
   *  saved without one. Sidebar display only — may be stale. */
  number: string;
  /** Denormalized title / subject. Sidebar display only — may be stale. */
  title: string;
  /** ISO datetime. */
  viewedAt: string;
};

const RECENT_ENTITY_TYPE_SET = new Set<string>(RECENT_ENTITY_TYPES);

/** Narrow a raw JSON value to `RecentItem[]`. Drops any element that doesn't
 *  pass shape + enum validation — defends the read path against manually-
 *  edited DB rows or schema drift.
 *
 *  Exported for `recent-entities.test.ts` — the narrowing has eight reject
 *  branches and a clear pure-function contract, so it's worth pinning. */
export function extractRecents(raw: unknown): RecentItem[] {
  if (typeof raw !== "object" || raw === null) return [];
  const arr = (raw as StoredPrefs).recentlyViewed;
  if (!Array.isArray(arr)) return [];
  const out: RecentItem[] = [];
  for (const entry of arr) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.entityType !== "string") continue;
    if (!RECENT_ENTITY_TYPE_SET.has(e.entityType)) continue;
    if (typeof e.entityId !== "number" || !Number.isInteger(e.entityId)) {
      continue;
    }
    if (typeof e.projectId !== "number" || !Number.isInteger(e.projectId)) {
      continue;
    }
    if (typeof e.number !== "string") continue;
    if (typeof e.title !== "string") continue;
    if (typeof e.viewedAt !== "string") continue;
    out.push({
      entityType: e.entityType as RecentEntityType,
      entityId: e.entityId,
      projectId: e.projectId,
      number: e.number,
      title: e.title,
      viewedAt: e.viewedAt,
    });
  }
  return out;
}

/** Sidebar reads this via `useQuery`. The server filters out entries from
 *  projects the user can no longer access (rather than 403-ing or showing
 *  un-clickable items). */
export const fetchUserRecents = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecentItem[]> => {
    const actor = await resolveCurrentUser();
    if (!actor) return [];
    const row = await prisma.userPreference.findUnique({
      where: { userId: actor.id },
      select: { prefs: true },
    });
    const all = row ? extractRecents(row.prefs) : [];
    if (all.length === 0) return all;
    const accessible = await getAccessibleProjectIds();
    if (accessible === "all") return all;
    return all.filter((r) => accessible.has(r.projectId));
  },
);

export const userRecentsQueryOptions = () =>
  queryOptions({
    queryKey: ["userRecents"],
    queryFn: () => fetchUserRecents(),
    // Short staleTime so a freshly-recorded view appears in the sidebar
    // promptly after the mutation invalidates the key.
    staleTime: 5 * 1000,
  });

/**
 * Pure dedup-prepend-cap transform. Lifted out of `recordRecentView` so it
 * can be unit-tested without a Prisma round-trip.
 *
 * Contract:
 *   - Returns a new array; never mutates `existing`.
 *   - The new entry is always at index 0.
 *   - Any prior entry with the same `(entityType, entityId)` is dropped
 *     (so re-opening a record moves it to the top, no duplicates).
 *   - Result length is capped at `RECENTS_MAX_STORED`; oldest items roll off.
 */
export function applyRecentView(
  existing: RecentItem[],
  newEntry: RecentItem,
): RecentItem[] {
  const deduped = existing.filter(
    (r) =>
      r.entityType !== newEntry.entityType ||
      r.entityId !== newEntry.entityId,
  );
  return [newEntry, ...deduped].slice(0, RECENTS_MAX_STORED);
}

/**
 * Append one view event to the user's recents list. Idempotent for a given
 * `(entityType, entityId)` — re-opening the same record moves the existing
 * entry to the top rather than duplicating. Capped at `RECENTS_MAX_STORED`;
 * oldest items roll off when the cap is exceeded.
 *
 * The handler enforces project access on the recorded projectId so a caller
 * can't seed their recents with records from projects they don't have
 * access to (defense in depth — the dialog only mounts for accessible
 * records, but the server fn endpoint is reachable independently).
 */
export const recordRecentView = createServerFn({ method: "POST" })
  .inputValidator(parseRecordRecentView)
  .handler(async ({ data }): Promise<RecentItem[]> => {
    const actor = await requireProjectAccess(data.projectId);

    const existing = await prisma.userPreference.findUnique({
      where: { userId: actor.id },
      select: { prefs: true },
    });
    const existingRecents = existing
      ? extractRecents(existing.prefs)
      : [];

    const newEntry: RecentItem = {
      entityType: data.entityType,
      entityId: data.entityId,
      projectId: data.projectId,
      number: data.number,
      title: data.title,
      // viewedAt comes from server time so client clock skew doesn't break
      // the newest-first ordering.
      viewedAt: new Date().toISOString(),
    };

    const next = applyRecentView(existingRecents, newEntry);

    // Merge into the existing prefs blob so other keys (dashboard prefs,
    // future preferences) aren't clobbered.
    const merged = {
      ...(typeof existing?.prefs === "object" && existing.prefs !== null
        ? (existing.prefs as object)
        : {}),
      recentlyViewed: next,
    };

    await prisma.userPreference.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, prefs: merged },
      update: { prefs: merged },
    });

    return next;
  });

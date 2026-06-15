import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { resolveCurrentUser } from "./users.server";
import { parseUpdateDashboardPrefs } from "~/lib/validators";

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

/**
 * Catalog of every togglable widget on the project dashboard. Single source
 * of truth — the dashboard route wraps each section in `isVisible(id)`, the
 * customize dialog renders one checkbox per entry, and the server-fn
 * validator pins `hiddenWidgets[]` to ids in this list.
 *
 * Adding a widget:
 *   1. Add an entry here.
 *   2. Wrap the new dashboard section in `{isVisible("new-id") && …}`.
 *   3. The drift-guard test in `dashboard-widgets.test.ts` will fail until
 *      both the catalog and the rendered usage stay in sync.
 *
 * Removing a widget: drop the entry. Stale ids that surface in old users'
 * stored `hiddenWidgets[]` are silently ignored at read time (we filter by
 * the live catalog), so no data migration is needed.
 *
 * New widgets are visible by default — explicit opt-out only. A user who
 * configured their dashboard months ago shouldn't silently lose access to a
 * helpful new section.
 */
export const DASHBOARD_WIDGETS = [
  { id: "evm", label: "Earned Value", category: "Reporting" },
  { id: "cvr-stats", label: "CVR stat cards", category: "Change Log" },
  { id: "fco-stats", label: "FCO stat cards", category: "FCO Log" },
  { id: "rfi-stats", label: "RFI stat cards", category: "RFIs" },
  { id: "needs-attention", label: "Needs attention", category: "Triage" },
  { id: "cvr-by-status", label: "CVRs by status", category: "Change Log" },
  { id: "fco-by-status", label: "FCOs by status", category: "FCO Log" },
  { id: "rfi-by-status", label: "RFIs by status", category: "RFIs" },
  { id: "cvr-by-risk", label: "CVRs by risk level", category: "Change Log" },
  {
    id: "cvr-by-discipline",
    label: "CVR cost by discipline",
    category: "Change Log",
  },
] as const;

export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];
export type DashboardWidgetId = DashboardWidget["id"];
export type DashboardWidgetCategory = DashboardWidget["category"];

/** Set of valid widget ids — used by the Zod validator to reject typos. */
export const DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGETS.map(
  (w) => w.id,
) as readonly DashboardWidgetId[];

/**
 * Builds a fast `isVisible(widgetId)` predicate for the dashboard's render
 * pass. Unknown ids in `hiddenWidgets` (e.g. from a removed widget that's
 * still in some user's saved prefs) are ignored — only ids that match the
 * live catalog count as hidden.
 */
export function makeIsVisible(
  hiddenWidgets: readonly string[],
): (id: DashboardWidgetId) => boolean {
  const liveCatalogIds = new Set<string>(DASHBOARD_WIDGET_IDS);
  const hidden = new Set(
    hiddenWidgets.filter((id) => liveCatalogIds.has(id)),
  );
  return (id) => !hidden.has(id);
}

/** Stable group order for the customize dialog. Matches the dashboard's
 *  rendering order so the dialog reads top-to-bottom the same way. */
export const DASHBOARD_WIDGET_CATEGORIES: readonly DashboardWidgetCategory[] = [
  "Reporting",
  "Triage",
  "Change Log",
  "FCO Log",
  "RFIs",
];

/**
 * Resolves the user's preferred widget order to a concrete `DashboardWidget[]`
 * by:
 *   1. Taking the user-saved `order` and keeping only ids that match the
 *      live catalog — stale ids (from a removed widget) drop out.
 *   2. Appending any catalog widget that wasn't in the user's order — so a
 *      newly-added widget doesn't disappear for a user who customized
 *      before it shipped, and a brand-new user with empty order gets the
 *      catalog's declared order.
 *
 * The returned list is the *full* ordered catalog; visibility (`hidden`)
 * is applied separately by `makeIsVisible` at the rendering layer.
 */
export function orderedWidgets(
  order: readonly string[],
): readonly DashboardWidget[] {
  const byId = new Map<string, DashboardWidget>(
    DASHBOARD_WIDGETS.map((w) => [w.id, w]),
  );
  const ordered: DashboardWidget[] = [];
  const used = new Set<string>();
  for (const id of order) {
    const w = byId.get(id);
    if (w && !used.has(id)) {
      ordered.push(w);
      used.add(id);
    }
  }
  for (const w of DASHBOARD_WIDGETS) {
    if (!used.has(w.id)) ordered.push(w);
  }
  return ordered;
}

/**
 * Canonical map from an entity's `entityType` (the discriminator shared by
 * AuditEvent / Notification) to its in-app list route. Single source of truth
 * for "where does this record live" — used by the NotificationBell (click →
 * navigate) and the email notifications ("Open in app" deep link).
 *
 * `as const` keeps the values as route literals so `navigate({ to })` stays
 * type-checked against the registered routes.
 */
export const ENTITY_LIST_PATH = {
  ChangeLog: "/changelog",
  FieldChangeOrder: "/fco-log",
  Rfi: "/rfis",
  Trend: "/trends",
  Pco: "/pco",
} as const;

export type EntityRouteKey = keyof typeof ENTITY_LIST_PATH;

/** Route for an entityType, or undefined for types without a list page. */
export function entityListPath(
  entityType: string,
): (typeof ENTITY_LIST_PATH)[EntityRouteKey] | undefined {
  return ENTITY_LIST_PATH[entityType as EntityRouteKey];
}

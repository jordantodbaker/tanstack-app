import {
  CHANGE_ENTITIES,
  CHANGE_ENTITY_TYPES,
  isChangeEntityType,
  type ChangeEntityType,
} from "~/config/change-entities";

/**
 * An entity's `entityType` (the discriminator shared by AuditEvent /
 * Notification) to its in-app list route — used by the NotificationBell
 * (click → navigate) and the email notifications ("Open in app" deep link).
 *
 * Read off `CHANGE_ENTITIES`; kept as a map so `navigate({ to })` stays
 * type-checked against the registered route literals.
 */
export const ENTITY_LIST_PATH = Object.fromEntries(
  CHANGE_ENTITY_TYPES.map((t) => [t, CHANGE_ENTITIES[t].listPath]),
) as { [T in ChangeEntityType]: (typeof CHANGE_ENTITIES)[T]["listPath"] };

export type EntityRouteKey = ChangeEntityType;

/** Route for an entityType, or undefined for types without a list page. */
export function entityListPath(
  entityType: string,
): (typeof ENTITY_LIST_PATH)[EntityRouteKey] | undefined {
  return isChangeEntityType(entityType)
    ? ENTITY_LIST_PATH[entityType]
    : undefined;
}

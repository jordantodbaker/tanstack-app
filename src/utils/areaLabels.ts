/**
 * Pure label formatting for an Area reference. Used by the CVR and FCO
 * list pages where records carry an Area.id as a string (or "" for
 * project-wide / unassigned) and need a human-readable "displayId — name"
 * for display, search, and CSV export.
 *
 * Note: the validation page has its own variant ("Unassigned" for empty,
 * "Area {id}" fallback) — intentionally different, not consolidated here.
 */

/** Minimum shape a row must expose for `formatAreaLabel` to resolve it. */
export type LabeledArea = {
  id: number | string;
  displayId: string;
  name: string;
};

/**
 * Resolves an area-id string (as stored on ChangeLog.area / FCO.locationArea)
 * to a display label. Returns:
 *   - "" when `raw` is empty (the record is project-wide).
 *   - "{displayId} — {name}" when matched and the area has a name.
 *   - "{displayId}" when matched and the area has no name.
 *   - The original `raw` when no area matches (legacy free-text passthrough).
 */
export function formatAreaLabel<A extends LabeledArea>(
  raw: string,
  areas: A[],
): string {
  if (!raw) return "";
  const match = areas.find((a) => String(a.id) === raw);
  if (!match) return raw;
  return match.name ? `${match.displayId} — ${match.name}` : match.displayId;
}

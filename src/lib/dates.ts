/**
 * True when the ISO date `iso` falls before the start of `now`'s day (i.e. it's
 * strictly in the past, counting today as not-yet-due). Returns false for a
 * null/blank date. Used by the RFI and Trend log pages to flag past-due items.
 */
export function isPast(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(iso) < startOfToday;
}

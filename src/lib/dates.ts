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

/** Parses an ISO date, or null for blank / unparseable input. */
function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "2026-05-21T..." → "May 21, 2026". Null/invalid → "—". The printable
 * forms use this; tables use the shorter `formatShortDate`.
 */
export function formatDate(iso: string | null): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * "2026-05-21T..." → "5/21/2026". Null/invalid → "—". Pinned to en-US so the
 * server render and the browser agree.
 */
export function formatShortDate(iso: string | null): string {
  const d = parseIso(iso);
  return d ? d.toLocaleDateString("en-US") : "—";
}

/** "2026-05-21T..." → "5/21/2026, 3:30:00 PM". Null/invalid → "—". */
export function formatDateTime(iso: string | null): string {
  const d = parseIso(iso);
  return d ? d.toLocaleString("en-US") : "—";
}

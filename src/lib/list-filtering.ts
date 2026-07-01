/**
 * Shared filter predicate for the change-pipeline list routes (CVR/FCO/RFI/
 * Trend/PCO). Every one applied the same three rules inline:
 *
 *   1. exact `status` match when a status filter is set,
 *   2. exact `discipline` match when a discipline filter is set (PCO has none),
 *   3. case-insensitive substring match of a trimmed search term against an
 *      entity-specific haystack string.
 *
 * The entity-specific part — which fields make up the haystack, how to read the
 * status/discipline — is supplied via `accessors`, so this stays a single,
 * unit-tested rule set instead of five near-identical copies. Routes with extra
 * predicates (e.g. FCO's linked/unlinked filter) apply those alongside this.
 */

export type ListFilterState = {
  /** Free-text search box value (untrimmed; this helper trims it). */
  search: string;
  /** "" means "any status". */
  statusFilter: string;
  /** "" means "any discipline"; ignored when no `discipline` accessor. */
  disciplineFilter: string;
};

export type ListFilterAccessors<T> = {
  status: (item: T) => string;
  /** Omit for entities without a discipline dimension (PCO). */
  discipline?: (item: T) => string | null | undefined;
  /** The concatenated, still-cased text to search within. */
  haystack: (item: T) => string;
};

export function matchesListFilters<T>(
  item: T,
  { search, statusFilter, disciplineFilter }: ListFilterState,
  accessors: ListFilterAccessors<T>,
): boolean {
  if (statusFilter && accessors.status(item) !== statusFilter) return false;
  if (
    disciplineFilter &&
    accessors.discipline &&
    accessors.discipline(item) !== disciplineFilter
  ) {
    return false;
  }
  const q = search.trim().toLowerCase();
  if (q && !accessors.haystack(item).toLowerCase().includes(q)) return false;
  return true;
}

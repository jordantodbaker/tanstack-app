import * as React from "react";

/**
 * Shared filter state for the change-pipeline list routes (CVR/FCO/RFI/Trend/
 * PCO). Every one of those pages keeps the same trio of local state:
 *
 *  - a free-text `search` box, seeded from the route's `?q` param (the global
 *    command palette deep-links here with a record number pre-filled),
 *  - a `statusFilter` (typed per entity via the `S` generic),
 *  - a `disciplineFilter` (PCO has no discipline — it just ignores that pair).
 *
 * The returned names match what the routes already use, so adopting the hook is
 * a one-line swap that leaves each page's filter bar and `matchesFilters`
 * predicate untouched.
 *
 * `q` is the route's current `?q` value (`Route.useSearch().q`). The effect
 * re-seeds `search` when it changes so navigating to an already-mounted route
 * with a new `q` still updates the box; cross-entity navigation remounts, which
 * the initializer covers.
 */
export function useListFilters<S extends string = string>(
  q: string | undefined,
) {
  const [search, setSearch] = React.useState(q ?? "");
  React.useEffect(() => {
    if (q !== undefined) setSearch(q);
  }, [q]);
  const [statusFilter, setStatusFilter] = React.useState<"" | S>("");
  const [disciplineFilter, setDisciplineFilter] = React.useState("");
  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    disciplineFilter,
    setDisciplineFilter,
  };
}

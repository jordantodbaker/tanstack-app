import { queryOptions, type QueryKey } from "@tanstack/react-query";

/**
 * Query-option builders shared by the change-pipeline entities' read paths.
 * They capture the two conventions every entity repeats verbatim:
 *  - project-scoped lists short-circuit to `[]` when no project is selected and
 *    treat data as fresh for 30s (matches the route loaders' preload window),
 *  - single-record reads short-circuit to `null` when there's no id and use the
 *    default staleness (the edit dialog wants the latest record on open).
 */

/** List read for a (possibly null) project. Returns `[]` until a project is set. */
export function projectScopedListQueryOptions<T, K extends QueryKey>(
  queryKey: K,
  projectId: number | null,
  fetch: (args: { data: number }) => Promise<T[]>,
) {
  return queryOptions({
    queryKey,
    queryFn: (): Promise<T[]> =>
      projectId === null ? Promise.resolve([]) : fetch({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });
}

/** Single-record read for a (possibly null) id. Returns `null` until an id is set. */
export function recordQueryOptions<T, K extends QueryKey>(
  queryKey: K,
  id: number | null,
  fetch: (args: { data: number }) => Promise<T | null>,
) {
  return queryOptions({
    queryKey,
    queryFn: (): Promise<T | null> =>
      id === null ? Promise.resolve(null) : fetch({ data: id }),
    enabled: id !== null,
  });
}

import type {
  QueryClient,
  QueryKey,
  FetchQueryOptions,
} from "@tanstack/react-query";

/**
 * Build the `getItems` callback for `ExportCsvButton` on a list page: fetch the
 * *full* (unpaged, all-columns) list, then re-apply the on-screen filters so the
 * exported CSV matches exactly what the user sees. Every log page (CVR / FCO /
 * RFI / Trend / PCO) exported this identical closure inline; this centralizes it.
 */
export function makeFilteredExport<T, K extends QueryKey>(
  queryClient: QueryClient,
  fullListOptions: FetchQueryOptions<T[], Error, T[], K>,
  matchesFilters: (item: T) => boolean,
): () => Promise<T[]> {
  return async () => {
    const full = await queryClient.fetchQuery(fullListOptions);
    return full.filter(matchesFilters);
  };
}

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Bust the three caches every change-pipeline entity (CVR/FCO/RFI/Trend/PCO)
 * exposes: the table `list`, the CSV `full` list, and the single-record cache
 * the edit dialog fills its form from.
 *
 * The single-record bust is a prefix match (`["<entity>", "single"]`) so a
 * reopened dialog refetches the just-saved record instead of serving a stale
 * cache — the bug that previously dropped freshly-added cost-buildup lines
 * until a hard refresh.
 *
 * Entity-specific extras (dashboard summary, EVM roll-ups, cross-entity option
 * lists) are NOT handled here — each `invalidate*Queries` calls this for the
 * common trio, then invalidates its own extras explicitly.
 */
export function invalidateEntityRecordQueries(
  queryClient: QueryClient,
  keys: { list: QueryKey; full: QueryKey; singleAll: QueryKey },
): void {
  queryClient.invalidateQueries({ queryKey: keys.list });
  queryClient.invalidateQueries({ queryKey: keys.full });
  queryClient.invalidateQueries({ queryKey: keys.singleAll });
}

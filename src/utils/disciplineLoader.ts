import type { QueryClient } from "@tanstack/react-query";
import { roleDataQueryOptions } from "./roles";
import { crewMixDataQueryOptions } from "./crewMixes";
import { fefRowsQueryOptions } from "./fefRows";
import { allowedFefCbsItemIdsQueryOptions } from "./setup";
import { tryPrefetchProjectQuery } from "./projectCookie";

/**
 * Shared prefetch chain for any discipline take-off route.
 *
 * Every discipline route (`/$discipline`, `/piping`, `/materials`, …) needs
 * the same baseline: role data + crew mix data (used by the take-off labor-
 * rate cells), the discipline's TAKE_OFF + SUPPORT_LABOR FefRow lists, and
 * the project's allowed CBS-item ids (used to filter dropdowns). Previously
 * each loader inlined those calls — every new discipline meant re-writing
 * the same prefetch chain.
 *
 * Project-scoped prefetches are wrapped in `tryPrefetchProjectQuery` so a
 * stale cookie projectId the user no longer has access to doesn't blow up
 * the loader; the page renders and `ProjectGuard` surfaces the not-assigned
 * state. Pass `null` for `projectId` when the user has no project selected.
 */
export async function prefetchDisciplineLoaderData(
  queryClient: QueryClient,
  disciplineId: string,
  projectId: number | null,
): Promise<void> {
  const promises: Promise<unknown>[] = [
    queryClient.ensureQueryData(roleDataQueryOptions(disciplineId)),
    queryClient.ensureQueryData(crewMixDataQueryOptions()),
  ];
  if (projectId !== null) {
    promises.push(
      tryPrefetchProjectQuery(
        queryClient.ensureQueryData(
          fefRowsQueryOptions({
            projectId,
            discipline: disciplineId,
            section: "TAKE_OFF",
          }),
        ),
      ),
      tryPrefetchProjectQuery(
        queryClient.ensureQueryData(
          fefRowsQueryOptions({
            projectId,
            discipline: disciplineId,
            section: "SUPPORT_LABOR",
          }),
        ),
      ),
      tryPrefetchProjectQuery(
        queryClient.ensureQueryData(
          allowedFefCbsItemIdsQueryOptions(projectId),
        ),
      ),
    );
  }
  await Promise.all(promises);
}

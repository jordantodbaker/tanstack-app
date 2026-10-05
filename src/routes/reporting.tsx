import { createFileRoute } from "@tanstack/react-router";
import {
  evmTimeSeriesQueryOptions,
  reportingPeriodsQueryOptions,
} from "~/utils/reporting";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";

// Route definition only. The page component and its (EVM chart + dialogs)
// dependency tree live in the sibling `reporting.lazy.tsx` so they ship as a
// per-route chunk loaded on navigation rather than fused into the entry
// bundle. The loader stays here because the router resolves it during the
// match phase, before the lazy chunk arrives.
export const Route = createFileRoute("/reporting")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      // Both queries are independent — prefetch in parallel.
      await Promise.all([
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            reportingPeriodsQueryOptions(projectId),
          ),
        ),
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            evmTimeSeriesQueryOptions(projectId),
          ),
        ),
      ]);
    }
  },
});

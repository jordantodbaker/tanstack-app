import { createFileRoute } from "@tanstack/react-router";
import { dashboardSummaryQueryOptions } from "~/utils/dashboardSummary";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { latestPeriodWithEvmQueryOptions } from "~/utils/reporting";

// Route definition only — the launcher component lives in the sibling
// `index.lazy.tsx` so it ships as its own chunk. The loader stays here because
// the router resolves it during the match phase, before the lazy chunk lands.
//
// Every figure on a card comes from a query some app already runs, so landing
// here warms their caches rather than paying for extra round trips.
export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId === null) return;
    await Promise.all([
      tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(
          dashboardSummaryQueryOptions(projectId),
        ),
      ),
      tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(
          latestPeriodWithEvmQueryOptions(projectId),
        ),
      ),
    ]);
  },
});

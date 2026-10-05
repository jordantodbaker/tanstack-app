import { createFileRoute } from "@tanstack/react-router";
import { dashboardSummaryQueryOptions } from "~/utils/dashboardSummary";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { latestPeriodWithEvmQueryOptions } from "~/utils/reporting";
import { userDashboardPrefsQueryOptions } from "~/utils/userPreferences";

// Route definition only. The page component and its (stat cards, badges,
// customize dialog) dependency tree live in the sibling `dashboard.lazy.tsx`
// so they ship as a per-route chunk loaded on navigation rather than fused
// into the entry bundle. The loader stays here because the router resolves it
// during the match phase, before the lazy chunk arrives.
export const Route = createFileRoute("/dashboard")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    // Prefs are user-scoped, not project-scoped — prefetch unconditionally so
    // the dashboard renders the right widget set on first paint even when
    // no project is selected.
    const prefetches: Promise<unknown>[] = [
      context.queryClient.ensureQueryData(userDashboardPrefsQueryOptions()),
    ];
    if (projectId !== null) {
      // Prefetch the aggregated summary (one round-trip; replaces the
      // prior three full-list prefetches).
      prefetches.push(
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
      );
    }
    await Promise.all(prefetches);
  },
});

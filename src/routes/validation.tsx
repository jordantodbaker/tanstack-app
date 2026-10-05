import { createFileRoute } from "@tanstack/react-router";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { devDocChecklistQueryOptions } from "~/utils/devDocs";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { resolveVersionIdForLoader } from "~/utils/versionCookie";

// Route definition only. The page component and its (chart + grid) dependency
// tree live in the sibling `validation.lazy.tsx` so they ship as a per-route
// chunk loaded on navigation rather than fused into the entry bundle. The
// loader stays here because the router resolves it during the match phase,
// before the lazy chunk arrives.
export const Route = createFileRoute("/validation")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    const versionId = await resolveVersionIdForLoader(projectId);
    if (projectId !== null) {
      await Promise.all([
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            projectFefRowTotalsQueryOptions(versionId),
          ),
        ),
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            areasByProjectQueryOptions(projectId),
          ),
        ),
        ...(versionId !== null
          ? [
              tryPrefetchProjectQuery(
                context.queryClient.ensureQueryData(
                  devDocChecklistQueryOptions(versionId),
                ),
              ),
            ]
          : []),
      ]);
    }
  },
});

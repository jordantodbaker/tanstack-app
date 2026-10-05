import { createFileRoute } from "@tanstack/react-router";
import { rfiListQueryOptions } from "~/utils/rfis";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";

// Route definition only. The page component and its (dialog, bulk-action,
// export) dependency tree live in the sibling `rfis.lazy.tsx` so they ship as
// a per-route chunk loaded on navigation rather than fused into the entry
// bundle. The loader + validateSearch stay here because the router resolves
// them during the match phase, before the lazy chunk arrives.
export const Route = createFileRoute("/rfis")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(rfiListQueryOptions(projectId)),
      );
    }
  },
  // `?q` lets the global search palette deep-link here with a record's number
  // pre-seeded into the page search box.
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s.q === "string" ? { q: s.q } : {},
});

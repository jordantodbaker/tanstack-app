import { createFileRoute } from "@tanstack/react-router";
import { changeLogQueryOptions } from "~/utils/changelog";

/**
 * Printable single-CVR detail view. Reached via the dialog's "Print / Save as
 * PDF" link (`target=_blank`). The actual component lives in the sibling
 * `.lazy.tsx` file so the print UI + its `PrintablePageShell` dependency tree
 * only ships when a user actually clicks through to a print URL — never as
 * part of the initial bundle for users who just want the live dialog view.
 *
 * The `loader` stays here because TanStack Router needs to resolve it during
 * the route match phase (before the lazy chunk arrives), so the data is
 * already in the cache when the lazy component mounts.
 */
export const Route = createFileRoute("/cvr-print/$id")({
  loader: async ({ context, params }) => {
    const id = Number.parseInt(params.id, 10);
    if (Number.isFinite(id)) {
      await context.queryClient
        .ensureQueryData(changeLogQueryOptions(id))
        .catch(() => null);
    }
  },
});

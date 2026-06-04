import { createFileRoute } from "@tanstack/react-router";
import { rfiQueryOptions } from "~/utils/rfis";

/**
 * Printable single-RFI detail view. Reached via the RFI dialog's "Print /
 * PDF" link (`target=_blank`). The actual component lives in the sibling
 * `.lazy.tsx` file so the print UI tree only ships when a user actually
 * clicks through.
 */
export const Route = createFileRoute("/rfi-print/$id")({
  loader: async ({ context, params }) => {
    const id = Number.parseInt(params.id, 10);
    if (Number.isFinite(id)) {
      await context.queryClient
        .ensureQueryData(rfiQueryOptions(id))
        .catch(() => null);
    }
  },
});

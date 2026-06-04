import { createFileRoute } from "@tanstack/react-router";
import { fcoQueryOptions } from "~/utils/fcoLog";

/**
 * Printable single-FCO detail view. Reached via the FCO dialog's "Print /
 * PDF" link (`target=_blank`). The actual component lives in the sibling
 * `.lazy.tsx` file so the print UI + its `PrintablePageShell` tree only
 * ships when a user actually clicks through.
 */
export const Route = createFileRoute("/fco-print/$id")({
  loader: async ({ context, params }) => {
    const id = Number.parseInt(params.id, 10);
    if (Number.isFinite(id)) {
      await context.queryClient
        .ensureQueryData(fcoQueryOptions(id))
        .catch(() => null);
    }
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { cbsCatalogQueryOptions } from "~/utils/cbs";
import { CbsDictionaryStatus } from "~/components/Cbs/CbsDictionaryBrowser";
import { CbsDictionarySections } from "~/components/Cbs/CbsDictionarySections";

/**
 * Admin → Master CBS. The same browser as the Project Cost Code List, over
 * the WHOLE dictionary: no project allow-list is applied, so it shows accounts a
 * given project was deliberately not granted. Not project-scoped at all —
 * changing the selected project does not change what it lists.
 *
 * Admin role gate lives on the parent `/admin` layout route; the server fn
 * carries its own `requireAdmin` so the API is independently protected.
 */
export const Route = createFileRoute("/admin/master-cbs")({
  component: AdminMasterCbsPage,
});

function AdminMasterCbsPage() {
  const query = useQuery(cbsCatalogQueryOptions());

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <BookOpen className="size-6" />
          Master CBS
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The complete CBS Dictionary, independent of any project. Use it to
          look up an account before granting it to a project on the Setup page.
          Read-only — the catalog itself changes only through a CBS import.
        </p>
      </header>

      {query.isPending || query.isError ? (
        <CbsDictionaryStatus
          isPending={query.isPending}
          isError={query.isError}
          errorMessage="Failed to load the CBS catalog."
        />
      ) : (
        <CbsDictionarySections items={query.data} />
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import {
  cbsCatalogQueryOptions,
  cbsLastImportQueryOptions,
  type CbsLastImport,
} from "~/utils/cbs";
import { formatDateTime } from "~/lib/dates";
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
  // `?code=` opens the page on one account — the link you paste into an email
  // so the reader lands on the row. Parsed leniently: an unknown code just
  // shows the page as normal.
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: AdminMasterCbsRoute,
});

/**
 * Reads the search param and hands it down. Kept separate from the page so
 * the page can be rendered in a test without a RouterProvider.
 */
function AdminMasterCbsRoute() {
  const { code } = Route.useSearch();
  return <AdminMasterCbsPage focusCode={code ?? null} />;
}

/**
 * When the CBS last changed, under the page title: the latest `cbs:import`
 * run and what it did. Says so plainly when there is no record — a database
 * whose imports all predate the `CbsImport` table — rather than guessing
 * from the rows, which carry no dates. Hidden while loading or on error: it
 * is a footnote, and the sections below report their own failures.
 */
function CbsLastImportNote() {
  const query = useQuery(cbsLastImportQueryOptions());
  if (query.isPending || query.isError) return null;
  return (
    <p className="mt-2 text-xs text-slate-500" data-testid="cbs-last-import">
      {query.data === null ? (
        "Last CBS update: not recorded — no import has run since this was added."
      ) : (
        <LastImportSummary last={query.data} />
      )}
    </p>
  );
}

function LastImportSummary({ last }: { last: CbsLastImport }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const changes = [
    last.created > 0 && `${n(last.created)} added`,
    last.updated > 0 && `${n(last.updated)} changed`,
    last.deleted > 0 && `${n(last.deleted)} removed`,
  ].filter((s): s is string => typeof s === "string");
  return (
    <>
      <span className="font-medium text-slate-600">Last CBS update:</span>{" "}
      <time dateTime={last.importedAt}>{formatDateTime(last.importedAt)}</time>
      {" — "}
      {n(last.finalCount)} codes
      {changes.length > 0 ? ` (${changes.join(", ")})` : " (no changes)"}
      {last.workbookModified && (
        <>
          {"; workbook saved "}
          <time dateTime={last.workbookModified}>
            {formatDateTime(last.workbookModified)}
          </time>
        </>
      )}
    </>
  );
}

export function AdminMasterCbsPage({
  focusCode = null,
}: {
  focusCode?: string | null;
} = {}) {
  const query = useQuery(cbsCatalogQueryOptions());

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <BookOpen className="size-6" />
          CBS Code Book
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The complete CBS, independent of any project. Use it to look up an
          account before granting it to a project on the Setup page. Read-only —
          the code book itself changes only through a CBS import.
        </p>
        <CbsLastImportNote />
      </header>

      {query.isPending || query.isError ? (
        <CbsDictionaryStatus
          isPending={query.isPending}
          isError={query.isError}
          errorMessage="Failed to load the CBS Code Book."
        />
      ) : (
        <CbsDictionarySections items={query.data} focusCode={focusCode} />
      )}
    </div>
  );
}

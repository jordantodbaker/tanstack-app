import { createFileRoute } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";
import { CbsHealthView } from "~/components/Cbs/CbsHealthView";

/**
 * CBS Health — the catalog's data-quality checks, run against the live
 * workbook and database.
 *
 * These checks already existed, scattered through the import's stdout and a
 * handful of one-off scripts. Putting them on a page means a bad workbook is
 * noticed the day it lands rather than the day someone goes looking.
 *
 * Admin role gate lives on the parent `/admin` layout route; `fetchCbsHealth`
 * carries its own `requireAdmin` so the API is independently protected.
 */
export const Route = createFileRoute("/admin/cbs-health")({
  component: AdminCbsHealthPage,
});

function AdminCbsHealthPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Stethoscope className="size-6" />
          CBS Health
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          What is wrong with the cost code catalog, if anything — the checks the
          import prints once and then forgets, run against CBS.xlsx and the
          database as they stand now. Checks that pass are listed too, so you
          can tell &ldquo;nothing reported&rdquo; from &ldquo;never
          asked&rdquo;.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white pt-1 shadow-sm">
        <CbsHealthView />
      </div>
    </div>
  );
}

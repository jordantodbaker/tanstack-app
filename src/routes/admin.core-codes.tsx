import { createFileRoute } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { CbsCoreLinksView } from "~/components/Cbs/CbsCoreLinksView";

/**
 * Core Code Roll-up — the CBS read down its second axis.
 *
 * A CBS code says where a cost sits; a Core code says what kind of cost it is,
 * by naming the account in 050 Field Indirects it belongs with. The page shows
 * which disciplines have been coded onto each core account and which have not.
 *
 * Admin role gate lives on the parent `/admin` layout route; `fetchCbsCoreLinks`
 * carries its own `requireAdmin` so the API is independently protected.
 */
export const Route = createFileRoute("/admin/core-codes")({
  component: AdminCoreCodesPage,
});

function AdminCoreCodesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Share2 className="size-6" />
          Core Code Roll-up
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          How CBS items across the disciplines link to shared core accounts, so
          an estimate can be totalled by discipline <em>and</em> by kind of
          cost. Read-only — core codes change only through a CBS import. The
          coding is a work in progress, so this page is as much about the gaps
          as the links.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white pt-1 shadow-sm">
        <CbsCoreLinksView />
      </div>
    </div>
  );
}

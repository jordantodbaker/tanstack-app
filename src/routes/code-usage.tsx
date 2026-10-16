import { createFileRoute } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { CbsUsageView } from "~/components/Cbs/CbsUsageView";

/**
 * Code Usage — this project's allow-list against what its estimate books to.
 *
 * Project-scoped rather than admin-only: it is the project's own data, and the
 * people who would prune an allow-list are the ones estimating with it. The
 * server fn is guarded on the project, so a member of one project cannot read
 * another's.
 */
export const Route = createFileRoute("/code-usage")({
  component: CodeUsagePage,
});

function CodeUsagePage() {
  const { projectId } = useSelectedProject();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Flame className="size-6" />
          Code Usage
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          How much of this project&rsquo;s cost code list the estimate actually
          uses. The Project Cost Code List shows what is <em>permitted</em>;
          this shows what is <em>used</em>, by division, so an allow-list can be
          trimmed on evidence. Usage counts rows in every estimate version, not
          just the current one.
        </p>
      </header>

      {projectId === null ? (
        <p className="text-sm text-slate-500">
          Choose a project to see how much of its code list is in use.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white pt-1 shadow-sm">
          <CbsUsageView key={projectId} projectId={projectId} />
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useSelectedProject } from "~/lib/selected-project";
import { projectCostCodesQueryOptions } from "~/utils/cbs";
import {
  CbsDictionaryBrowser,
  CbsDictionaryStatus,
} from "~/components/Cbs/CbsDictionaryBrowser";

/**
 * Project Cost Code List — the cost codes available on the selected project.
 *
 * One list, read the way the CBS Dictionary reads: every cost line the project
 * has been granted on its own row, generated S / M rows included, and active
 * codes only. Admin → Master CBS shows the same views over the whole catalog.
 *
 * The browser itself is shared with that page — see `CbsDictionaryBrowser`;
 * this page only scopes the rows to one project.
 */

const SOURCE_NOTE =
  "Source: the CBS Dictionary, limited to the items selected for this project on the Setup page. Colors mirror the source workbook's outline levels.";

function ProjectCostCodes({
  projectId,
  focusCode,
}: {
  projectId: number;
  focusCode: string | null;
}) {
  // Already filtered to granted, active rows server-side.
  const query = useQuery(projectCostCodesQueryOptions(projectId));

  if (query.isPending || query.isError) {
    return (
      <CbsDictionaryStatus
        isPending={query.isPending}
        isError={query.isError}
        errorMessage="Failed to load this project's cost codes."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white pt-4 shadow-sm">
      <CbsDictionaryBrowser
        items={query.data}
        sourceNote={SOURCE_NOTE}
        emptyMessage="No cost codes selected for this project."
        exportView="projectCostCodes"
        focusCode={focusCode}
      />
    </div>
  );
}

export function ProjectCostCodeListView({
  focusCode = null,
}: {
  /** A display code to open on arrival — the `?code=` deep link. */
  focusCode?: string | null;
} = {}) {
  const { projectId } = useSelectedProject();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">
          Project Cost Code List
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The cost codes available on this project — the CBS rows selected on
          the Setup page — as a color-coded, collapsible hierarchy, each cost
          type on its own line. Grayed-out rows are parent summaries the project
          wasn't given, shown so the codes under them nest correctly. Only
          active codes are listed — see the CBS Dictionary for inactive and
          retired ones. Colors and grouping mirror the source workbook.
        </p>
      </header>

      {projectId === null ? (
        <p className="text-sm text-slate-500">
          Choose a project to see its cost codes.
        </p>
      ) : (
        <ProjectCostCodes
          key={projectId}
          projectId={projectId}
          focusCode={focusCode}
        />
      )}
    </div>
  );
}

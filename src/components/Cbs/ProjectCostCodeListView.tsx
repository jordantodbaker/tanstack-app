import { useQuery } from "@tanstack/react-query";
import { useSelectedProject } from "~/lib/selected-project";
import { projectCostCodesQueryOptions } from "~/utils/cbs";
import {
  CbsDictionaryBrowser,
  CbsDictionaryStatus,
  cbsFlagBadgesFor,
} from "~/components/Cbs/CbsDictionaryBrowser";

/**
 * Project Cost Code List — the cost codes available on the selected project.
 *
 * One list, of the ORIGINAL Master CBS rows the project has been granted (what
 * was the "CBS Code Book" section). The generated S/M rows are deliberately
 * not listed: an original row's own S / M badge already says whether it carries
 * a sub code or a material code. Admin → Master CBS still shows both views
 * over the whole catalog.
 *
 * The browser itself is shared with that page — see `CbsDictionaryBrowser`;
 * this page only scopes the rows to one project.
 */

const SOURCE_NOTE =
  "Source: the Master CBS Dictionary (prisma/data/MasterCBS.xlsx), limited to the items selected for this project on the Setup page. Colours mirror the workbook's outline levels.";

function ProjectCostCodes({ projectId }: { projectId: number }) {
  // Already filtered to original rows server-side.
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
        badgesFor={cbsFlagBadgesFor}
        sourceNote={SOURCE_NOTE}
        emptyMessage="No cost codes selected for this project."
        showRowTypeCounts={false}
      />
    </div>
  );
}

export function ProjectCostCodeListView() {
  const { projectId } = useSelectedProject();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">
          Project Cost Code List
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The cost codes available on this project — the Master CBS rows
          selected on the Setup page — as a colour-coded, collapsible
          hierarchy. <strong>S</strong> and <strong>M</strong> mark a code's own
          Sub Code and Material Code. Colours and grouping mirror the Master CBS
          Dictionary workbook.
        </p>
      </header>

      {projectId === null ? (
        <p className="text-sm text-slate-500">
          Choose a project to see its cost codes.
        </p>
      ) : (
        <ProjectCostCodes key={projectId} projectId={projectId} />
      )}
    </div>
  );
}

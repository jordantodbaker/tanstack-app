import * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Maximize2 } from "lucide-react";
import { currentUserQueryOptions, hasAtLeastRole } from "~/utils/users";
import {
  cbsCatalogQueryOptions,
  projectCostCodesQueryOptions,
  type CbsBrowserRow,
} from "~/utils/cbs";
import { useSelectedProject } from "~/lib/selected-project";
import { cbsIsActive } from "~/lib/cbs-tree";
import {
  cbsRowFilterStateFromSearch,
  parseCbsFullscreenSearch,
  type CbsFullscreenSearch,
  type CbsFullscreenView,
} from "~/lib/cbs-fullscreen";
import type { CbsExportView } from "~/lib/cbs-export";
import { ProjectGuard } from "~/components/ProjectGuard";
import {
  CbsDictionaryBrowser,
  CbsDictionaryStatus,
} from "~/components/Cbs/CbsDictionaryBrowser";
import {
  ADMIN_MASTER_CBS_PATH,
  MASTER_EMPTY,
  MASTER_SOURCE_NOTE,
} from "~/components/Cbs/CbsDictionarySections";
import {
  PROJECT_COST_CODES_EMPTY,
  PROJECT_COST_CODES_SOURCE_NOTE,
} from "~/components/Cbs/ProjectCostCodeListView";

/**
 * A CBS tree with nothing else on the screen.
 *
 * Opened in a new tab by the "Full screen" button on each tree: the Project
 * Cost Code List, and the Cost Accounts and CBS Dictionary sections of Admin
 * → Master CBS. The shell (`__root.tsx`) renders this route without its
 * header or sidebar, so the window is the tree and its toolbar. Which tree,
 * and the filters, the ungranted-parents choice and the selected row the
 * button was pressed with, come from the URL — see `~/lib/cbs-fullscreen` —
 * so the tab opens where the page left off.
 *
 * The two catalog views are the admin page's sections, so they carry the
 * same gate as `/admin`; the project view is project-scoped and goes through
 * `ProjectGuard` here, since the shell's guard is skipped with the chrome.
 */
export const Route = createFileRoute("/cbs-fullscreen")({
  validateSearch: parseCbsFullscreenSearch,
  beforeLoad: async ({ context, search }) => {
    if (search.view === "project") return;
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (!user || !hasAtLeastRole(user.role, "ADMINISTRATOR")) {
      throw redirect({ to: "/" });
    }
  },
  component: CbsFullscreenRoute,
});

/**
 * Reads the search and hands it down. Kept apart from the page so the page
 * can be rendered in a test without a RouterProvider.
 */
function CbsFullscreenRoute() {
  const search = Route.useSearch();
  return <CbsFullscreenPage search={search} />;
}

const VIEW_TITLES: Record<CbsFullscreenView, string> = {
  project: "Project Cost Code List",
  accounts: "Cost Accounts",
  dictionary: "CBS Dictionary",
};

export function CbsFullscreenPage({ search }: { search: CbsFullscreenSearch }) {
  // The URL is read once: the toolbar owns the filters from here, as it does
  // on the page the tab came from, and nothing writes them back.
  const [initialFilter] = React.useState(() =>
    cbsRowFilterStateFromSearch(search),
  );
  const [initialHideContext] = React.useState(
    () => search.hideContext === true,
  );
  const focusCode = search.code ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Maximize2 className="size-4 shrink-0 text-slate-500" />
        <h1 className="text-base font-bold text-slate-800">
          {VIEW_TITLES[search.view]}
        </h1>
        <span className="ml-2 text-xs text-slate-500">
          Full screen — close this tab to go back.
        </span>
      </header>
      <div className="bg-white pt-3">
        {search.view === "project" ? (
          <ProjectGuard>
            <ProjectView
              focusCode={focusCode}
              initialFilter={initialFilter}
              initialHideContext={initialHideContext}
            />
          </ProjectGuard>
        ) : (
          <CatalogView
            view={search.view}
            focusCode={focusCode}
            initialFilter={initialFilter}
          />
        )}
      </div>
    </div>
  );
}

type ViewProps = {
  focusCode: string | null;
  initialFilter: ReturnType<typeof cbsRowFilterStateFromSearch>;
};

/** The selected project's cost codes — the Project Cost Code List's rows. */
function ProjectView({
  focusCode,
  initialFilter,
  initialHideContext,
}: ViewProps & { initialHideContext: boolean }) {
  const { projectId } = useSelectedProject();
  if (projectId === null) return null; // ProjectGuard has shown the prompt.
  return (
    <ProjectRows
      key={projectId}
      projectId={projectId}
      focusCode={focusCode}
      initialFilter={initialFilter}
      initialHideContext={initialHideContext}
    />
  );
}

function ProjectRows({
  projectId,
  focusCode,
  initialFilter,
  initialHideContext,
}: ViewProps & { projectId: number; initialHideContext: boolean }) {
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
    <FullscreenBrowser
      items={query.data}
      sourceNote={PROJECT_COST_CODES_SOURCE_NOTE}
      emptyMessage={PROJECT_COST_CODES_EMPTY}
      exportView="projectCostCodes"
      linkPath="/project-cost-codes"
      focusCode={focusCode}
      initialFilter={initialFilter}
      initialHideContext={initialHideContext}
    />
  );
}

/** One of Admin → Master CBS's two sections, over the whole catalog. */
function CatalogView({
  view,
  focusCode,
  initialFilter,
}: ViewProps & { view: Exclude<CbsFullscreenView, "project"> }) {
  const query = useQuery(cbsCatalogQueryOptions());
  // Cost Accounts is the Dictionary minus anything Inactive or Retired — the
  // same cut `CbsDictionarySections` makes.
  const items = React.useMemo(
    () =>
      view === "accounts" && query.data
        ? query.data.filter((r) => cbsIsActive(r.status))
        : query.data,
    [view, query.data],
  );
  if (query.isPending || query.isError || !items) {
    return (
      <CbsDictionaryStatus
        isPending={query.isPending}
        isError={query.isError}
        errorMessage="Failed to load the CBS Code Book."
      />
    );
  }
  return (
    <FullscreenBrowser
      items={items}
      sourceNote={MASTER_SOURCE_NOTE}
      emptyMessage={MASTER_EMPTY}
      exportView={view === "accounts" ? "codeBook" : "dictionary"}
      linkPath={ADMIN_MASTER_CBS_PATH}
      focusCode={focusCode}
      initialFilter={initialFilter}
      statusFilter={view === "dictionary"}
      rowTypeFilter={view === "dictionary"}
    />
  );
}

/** The shared browser in its full-screen shape: filling the window, no button to open another. */
function FullscreenBrowser(props: {
  items: CbsBrowserRow[];
  sourceNote: string;
  emptyMessage: string;
  exportView: CbsExportView;
  linkPath: string;
  focusCode: string | null;
  initialFilter: ReturnType<typeof cbsRowFilterStateFromSearch>;
  initialHideContext?: boolean;
  statusFilter?: boolean;
  rowTypeFilter?: boolean;
}) {
  return <CbsDictionaryBrowser {...props} fill />;
}

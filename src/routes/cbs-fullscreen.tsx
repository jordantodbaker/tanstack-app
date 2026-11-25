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
import {
  cbsRowFilterStateFromSearch,
  parseCbsFullscreenSearch,
  type CbsFullscreenSearch,
} from "~/lib/cbs-fullscreen";
import { CBS_VIEWS, type CbsCatalogView, type CbsView } from "~/lib/cbs-views";
import { ProjectGuard } from "~/components/ProjectGuard";
import {
  CbsDictionaryBrowser,
  CbsDictionaryStatus,
} from "~/components/Cbs/CbsDictionaryBrowser";
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

export function CbsFullscreenPage({ search }: { search: CbsFullscreenSearch }) {
  // The URL is read once: the toolbar owns the filters from here, as it does
  // on the page the tab came from, and nothing writes them back.
  const [initialFilter] = React.useState(() =>
    cbsRowFilterStateFromSearch(search),
  );
  const [initialHideContext] = React.useState(
    () => search.hideContext === true,
  );
  const viewProps: ViewProps = {
    focusCode: search.code ?? null,
    initialFilter,
    initialHideContext,
    initialShowLegacy: search.legacy === true,
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Maximize2 className="size-4 shrink-0 text-slate-500" />
        <h1 className="text-base font-bold text-slate-800">
          {CBS_VIEWS[search.view].title}
        </h1>
        <span className="ml-2 text-xs text-slate-500">
          Full screen — close this tab to go back.
        </span>
      </header>
      <div className="bg-white pt-3">
        {search.view === "project" ? (
          <ProjectGuard>
            <ProjectView {...viewProps} />
          </ProjectGuard>
        ) : (
          <CatalogView view={search.view} {...viewProps} />
        )}
      </div>
    </div>
  );
}

/** What the URL asked for, as the browser takes it. */
type ViewProps = Pick<
  React.ComponentProps<typeof CbsDictionaryBrowser>,
  "focusCode" | "initialFilter" | "initialHideContext" | "initialShowLegacy"
>;

/** The selected project's cost codes — the Project Cost Code List's rows. */
function ProjectView(props: ViewProps) {
  const { projectId } = useSelectedProject();
  if (projectId === null) return null; // ProjectGuard has shown the prompt.
  return <ProjectRows key={projectId} projectId={projectId} {...props} />;
}

function ProjectRows({
  projectId,
  ...props
}: ViewProps & { projectId: number }) {
  const query = useQuery(projectCostCodesQueryOptions(projectId));
  return <ViewBody view="project" query={query} {...props} />;
}

/** One of Admin → Master CBS's two sections, over the whole catalog. */
function CatalogView({ view, ...props }: ViewProps & { view: CbsCatalogView }) {
  const query = useQuery(cbsCatalogQueryOptions());
  return <ViewBody view={view} query={query} {...props} />;
}

/** The shared browser filling the window, once its rows are in. */
function ViewBody({
  view,
  query,
  ...props
}: ViewProps & {
  view: CbsView;
  query: { data?: CbsBrowserRow[]; isPending: boolean; isError: boolean };
}) {
  if (!query.data) {
    return (
      <CbsDictionaryStatus
        isPending={query.isPending}
        isError={query.isError}
        errorMessage={CBS_VIEWS[view].errorMessage}
      />
    );
  }
  return (
    <CbsDictionaryBrowser view={view} items={query.data} {...props} fill />
  );
}

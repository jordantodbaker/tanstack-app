import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2, Lock } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { projectsQueryOptions } from "~/utils/projects";
import { currentUserQueryOptions, hasAtLeastRole } from "~/utils/users";

/**
 * Gates project-scoped pages on (a) the user having at least one accessible
 * project and (b) one being selected. On first ready render it auto-selects
 * the user's first project, and resets a stale persisted selection if the
 * user has lost access to it. Admins bypass the access check (their project
 * list is unfiltered) but still use the auto-select.
 *
 * Render contract:
 *   - Loading the gating data → centered spinner.
 *   - Non-admin with no assigned projects → "Not assigned" full-pane screen.
 *   - Admin with no projects in the system → "No projects yet" pointing at
 *     the admin Projects page.
 *   - Otherwise no project selected (user explicitly cleared) → "Select a
 *     project" prompt.
 *   - Project selected → render children.
 *
 * The guard intentionally runs INSIDE `<main>` so the header (and its
 * project selector) remain available — that's where the user resolves the
 * "no selection" state.
 */
export function ProjectGuard({ children }: { children: React.ReactNode }) {
  const currentUserQuery = useQuery(currentUserQueryOptions());
  const projectsQuery = useQuery(projectsQueryOptions());
  const { projectId, setProjectId, isHydrated } = useSelectedProject();

  const projects = projectsQuery.data ?? [];
  const user = currentUserQuery.data;
  const isAdmin = user ? hasAtLeastRole(user.role, "ADMINISTRATOR") : false;

  const ready =
    isHydrated &&
    currentUserQuery.data !== undefined &&
    projectsQuery.data !== undefined;

  // Auto-select / stale-clear runs once per mount-and-hydrate cycle. After
  // that the user is free to clear the selection from the dropdown — they'll
  // see the "no project selected" prompt rather than instantly re-defaulting.
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (initialized.current || !ready) return;
    initialized.current = true;

    if (projectId === null) {
      if (projects.length > 0) setProjectId(projects[0].id);
      return;
    }
    // Non-admins may have a persisted selection they've since lost access to
    // (e.g. an admin un-assigned them). Reset to the first accessible one.
    if (!isAdmin && !projects.some((p) => p.id === projectId)) {
      setProjectId(projects[0]?.id ?? null);
    }
  }, [ready, projectId, projects, isAdmin, setProjectId]);

  if (!ready) return <CenteredLoading />;

  if (!isAdmin && projects.length === 0) {
    return <NoProjectsAssigned />;
  }
  if (isAdmin && projects.length === 0) {
    return <NoProjectsYet />;
  }
  if (projectId === null) {
    return <NoProjectSelected />;
  }

  return <>{children}</>;
}

function CenteredLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="size-6 text-slate-400 animate-spin" />
    </div>
  );
}

function NoProjectsAssigned() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md text-center">
        <Lock className="size-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          No project access
        </h2>
        <p className="text-sm text-slate-500">
          You are not assigned to any projects. Contact your administrator
          to get access.
        </p>
      </div>
    </div>
  );
}

function NoProjectsYet() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md text-center">
        <FolderOpen className="size-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          No projects yet
        </h2>
        <p className="text-sm text-slate-500">
          Create the first project from the Admin → Projects page.
        </p>
      </div>
    </div>
  );
}

function NoProjectSelected() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md text-center">
        <FolderOpen className="size-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          No project selected
        </h2>
        <p className="text-sm text-slate-500">
          Please select a project from the dropdown in the header.
        </p>
      </div>
    </div>
  );
}

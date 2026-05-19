import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Plus, Shield } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Th, TableEmptyState } from "~/components/ui/list-page";
import { ProjectDialog } from "~/components/Admin/ProjectDialog";
import {
  projectsQueryOptions,
  upsertProject,
  deleteProject,
  type ProjectOption,
  type UpsertProjectInput,
} from "~/utils/projects";
import { currentUserQueryOptions, hasAtLeastRole } from "~/utils/users";

export const Route = createFileRoute("/admin/projects")({
  // Server-side gate: the nav link is hidden for non-admins, but block direct
  // navigation here too. Redirects anyone below ADMINISTRATOR away.
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (!user || !hasAtLeastRole(user.role, "ADMINISTRATOR")) {
      throw redirect({ to: "/changelog" });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(projectsQueryOptions());
  },
  component: AdminProjectsPage,
});

function AdminProjectsPage() {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery(projectsQueryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });

  const upsert = useMutation({
    mutationFn: (input: UpsertProjectInput) => upsertProject({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteProject({ data: { id } }),
    onSuccess: invalidate,
  });

  function handleSubmit(input: UpsertProjectInput) {
    return upsert.mutateAsync(input);
  }

  function handleDelete(id: number) {
    return remove.mutateAsync(id);
  }

  return (
    <main className="p-4 max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="size-6 text-slate-600" />
            Projects
          </h1>
          <p className="text-sm text-slate-500">
            Add, edit, and remove the projects available across the platform.
          </p>
        </div>
        <ProjectDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" />
              New Project
            </Button>
          }
          onSubmit={handleSubmit}
        />
      </div>

      <ProjectsTable
        projects={projects}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </main>
  );
}

function ProjectsTable({
  projects,
  onSubmit,
  onDelete,
}: {
  projects: ProjectOption[];
  onSubmit: (input: UpsertProjectInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  if (projects.length === 0) {
    return (
      <TableEmptyState message="No projects yet. Create the first one." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>Display ID</Th>
            <Th>Name</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onSubmit={onSubmit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRow({
  project,
  onSubmit,
  onDelete,
}: {
  project: ProjectOption;
  onSubmit: (input: UpsertProjectInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100";
  return (
    <ProjectDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {project.displayId}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            {project.name}
          </td>
          <td className={`${cellCls} text-slate-500 max-w-md truncate`}>
            {project.description || "—"}
          </td>
        </tr>
      }
      initial={project}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}

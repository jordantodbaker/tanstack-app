import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Shield } from "lucide-react";
import { Button } from "~/components/ui/button";
import { ProjectDialog } from "~/components/Admin/ProjectDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  projectsQueryOptions,
  upsertProject,
  deleteProject,
  type ProjectOption,
  type UpsertProjectInput,
} from "~/utils/projects";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/projects")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(projectsQueryOptions());
  },
  component: AdminProjectsPage,
});

function AdminProjectsPage() {
  const { data: projects = [] } = useQuery(projectsQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertProjectInput>({
    entity: "projects",
    upsertFn: upsertProject,
    deleteFn: deleteProject,
  });

  return (
    <AdminListPage
      icon={Shield}
      title="Projects"
      subtitle="Add, edit, and remove the projects available across the platform."
      action={
        <ProjectDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" />
              New Project
            </Button>
          }
          onSubmit={onSubmit}
        />
      }
      items={projects}
      emptyMessage="No projects yet. Create the first one."
      columns={["Display ID", "Name", "Description"]}
      renderRow={(project) => (
        <ProjectRow
          key={project.id}
          project={project}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AreaDialog } from "~/components/Admin/AreaDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  areasQueryOptions,
  upsertArea,
  deleteArea,
  type AreaOption,
  type UpsertAreaInput,
} from "~/utils/areas";
import { projectsQueryOptions, type ProjectOption } from "~/utils/projects";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/areas")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(areasQueryOptions()),
      context.queryClient.ensureQueryData(projectsQueryOptions()),
    ]);
  },
  component: AdminAreasPage,
});

function AdminAreasPage() {
  const { data: areas = [] } = useQuery(areasQueryOptions());
  const { data: projects = [] } = useQuery(projectsQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertAreaInput>({
    entity: "areas",
    upsertFn: upsertArea,
    deleteFn: deleteArea,
  });

  const projectLabel = React.useMemo(() => {
    const map = new Map(
      projects.map((p) => [p.id, `${p.displayId} — ${p.name}`]),
    );
    return (projectId: number) => map.get(projectId) ?? "—";
  }, [projects]);

  return (
    <AdminListPage
      icon={MapPin}
      title="Areas"
      subtitle="Physical locations on a project. Each area belongs to one project."
      action={
        <AreaDialog
          projects={projects}
          trigger={
            <Button disabled={projects.length === 0}>
              <Plus className="mr-1 size-4" />
              New Area
            </Button>
          }
          onSubmit={onSubmit}
        />
      }
      items={areas}
      emptyMessage="No areas yet. Create the first one."
      preconditionMessage={
        projects.length === 0
          ? "Create a project first — areas must belong to one."
          : null
      }
      columns={["Area ID", "Name", "Description", "Project"]}
      renderRow={(area) => (
        <AreaRow
          key={area.id}
          area={area}
          projectLabel={projectLabel(area.projectId)}
          projects={projects}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
  );
}

function AreaRow({
  area,
  projectLabel,
  projects,
  onSubmit,
  onDelete,
}: {
  area: AreaOption;
  projectLabel: string;
  projects: ProjectOption[];
  onSubmit: (input: UpsertAreaInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100";
  return (
    <AreaDialog
      projects={projects}
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {area.displayId}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            {area.name}
          </td>
          <td className={`${cellCls} text-slate-500 max-w-md truncate`}>
            {area.description || "—"}
          </td>
          <td className={`${cellCls} text-slate-600`}>{projectLabel}</td>
        </tr>
      }
      initial={area}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}

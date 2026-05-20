import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Th, TableEmptyState } from "~/components/ui/list-page";
import { AreaDialog } from "~/components/Admin/AreaDialog";
import { AdminPageHeader } from "~/components/Admin/AdminPageHeader";
import { invalidateAdminEntity } from "~/lib/admin-invalidations";
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
  const queryClient = useQueryClient();
  const { data: areas = [] } = useQuery(areasQueryOptions());
  const { data: projects = [] } = useQuery(projectsQueryOptions());

  const invalidate = () => invalidateAdminEntity(queryClient, "areas");

  const upsert = useMutation({
    mutationFn: (input: UpsertAreaInput) => upsertArea({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteArea({ data: { id } }),
    onSuccess: invalidate,
  });

  function handleSubmit(input: UpsertAreaInput) {
    return upsert.mutateAsync(input);
  }

  function handleDelete(id: number) {
    return remove.mutateAsync(id);
  }

  const projectLabel = React.useMemo(() => {
    const map = new Map(
      projects.map((p) => [p.id, `${p.displayId} — ${p.name}`]),
    );
    return (projectId: number) => map.get(projectId) ?? "—";
  }, [projects]);

  return (
    <main className="p-4 max-w-5xl space-y-6">
      <AdminPageHeader
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
            onSubmit={handleSubmit}
          />
        }
      />

      {projects.length === 0 ? (
        <TableEmptyState message="Create a project first — areas must belong to one." />
      ) : areas.length === 0 ? (
        <TableEmptyState message="No areas yet. Create the first one." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Th>Area ID</Th>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Project</Th>
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  projectLabel={projectLabel(area.projectId)}
                  projects={projects}
                  onSubmit={handleSubmit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
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

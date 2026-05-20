import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Th, TableEmptyState } from "~/components/ui/list-page";
import { AreaDialog } from "~/components/Admin/AreaDialog";
import {
  areasQueryOptions,
  upsertArea,
  deleteArea,
  type AreaOption,
  type UpsertAreaInput,
} from "~/utils/areas";
import { projectsQueryOptions, type ProjectOption } from "~/utils/projects";
import { currentUserQueryOptions, hasAtLeastRole } from "~/utils/users";

export const Route = createFileRoute("/admin/areas")({
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["areas"] });

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
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="size-6 text-slate-600" />
            Areas
          </h1>
          <p className="text-sm text-slate-500">
            Physical locations on a project. Each area belongs to one project.
          </p>
        </div>
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
      </div>

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

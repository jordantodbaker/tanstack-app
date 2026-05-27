import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Th, TableEmptyState } from "~/components/ui/list-page";
import { RoleDialog } from "~/components/Admin/RoleDialog";
import { AdminPageHeader } from "~/components/Admin/AdminPageHeader";
import { invalidateAdminEntity } from "~/lib/admin-invalidations";
import {
  rolesAdminQueryOptions,
  upsertRole,
  deleteRole,
  type RoleAdminItem,
  type UpsertRoleInput,
} from "~/utils/roles";
import { disciplineById } from "~/config/disciplines";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/roles")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(rolesAdminQueryOptions());
  },
  component: AdminRolesPage,
});

function AdminRolesPage() {
  const queryClient = useQueryClient();
  const { data: roles = [] } = useQuery(rolesAdminQueryOptions());

  const invalidate = () => invalidateAdminEntity(queryClient, "roles");

  const upsert = useMutation({
    mutationFn: (input: UpsertRoleInput) => upsertRole({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteRole({ data: { id } }),
    onSuccess: invalidate,
  });

  const handleSubmit = (input: UpsertRoleInput) => upsert.mutateAsync(input);
  const handleDelete = (id: number) => remove.mutateAsync(id);

  return (
    <main className="p-4 max-w-5xl space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Roles"
        subtitle="Construction discipline roles shown in the Take Off sheet's Role dropdown. A role only appears for the disciplines it's checked against."
        action={
          <RoleDialog
            trigger={
              <Button>
                <Plus className="mr-1 size-4" />
                New Role
              </Button>
            }
            onSubmit={handleSubmit}
          />
        }
      />

      <RolesTable
        roles={roles}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </main>
  );
}

function RolesTable({
  roles,
  onSubmit,
  onDelete,
}: {
  roles: RoleAdminItem[];
  onSubmit: (input: UpsertRoleInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  if (roles.length === 0) {
    return <TableEmptyState message="No roles yet. Create the first one." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Th>Name</Th>
            <Th>Disciplines</Th>
            <Th>Rates</Th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              onSubmit={onSubmit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleRow({
  role,
  onSubmit,
  onDelete,
}: {
  role: RoleAdminItem;
  onSubmit: (input: UpsertRoleInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const disciplineLabels = role.disciplines
    .map((id) => disciplineById[id]?.label ?? id)
    .sort();
  return (
    <RoleDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-medium text-slate-800`}>
            {role.name}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {disciplineLabels.length === 0 ? (
              <span className="text-amber-600">
                — (hidden from every Take Off)
              </span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {disciplineLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-500 text-xs`}>
            {role.rateCount === 0
              ? "—"
              : `${role.rateCount} rate${role.rateCount === 1 ? "" : "s"}`}
          </td>
        </tr>
      }
      initial={role}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}

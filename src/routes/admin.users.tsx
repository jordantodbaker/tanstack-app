import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Th, TableEmptyState } from "~/components/ui/list-page";
import { AdminPageHeader } from "~/components/Admin/AdminPageHeader";
import { invalidateAdminEntity } from "~/lib/admin-invalidations";
import {
  UserDialog,
  type UserFormState,
} from "~/components/Admin/UserDialog";
import {
  currentUserQueryOptions,
  updateUser,
  usersQueryOptions,
  ROLE_LABELS,
  type AdminUser,
} from "~/utils/users";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/users")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(usersQueryOptions());
  },
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery(usersQueryOptions());
  const { data: currentUser } = useQuery(currentUserQueryOptions());

  const save = useMutation({
    mutationFn: (input: UserFormState) => updateUser({ data: input }),
    onSuccess: () => invalidateAdminEntity(queryClient, "users"),
  });

  const handleSubmit = (input: UserFormState) => save.mutateAsync(input);

  return (
    <main className="p-4 max-w-5xl space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Users"
        subtitle="Everyone who has signed in to the platform. Click a row to change a user's role or project assignments."
      />

      {save.isError && (
        <p className="text-sm text-red-600">
          {(save.error as Error).message}
        </p>
      )}

      {users.length === 0 ? (
        <TableEmptyState message="No users yet. Users appear here after they first sign in." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Projects</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser?.id}
                  onSubmit={handleSubmit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function UserRow({
  user,
  isSelf,
  onSubmit,
}: {
  user: AdminUser;
  isSelf: boolean;
  onSubmit: (input: UserFormState) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  return (
    <UserDialog
      initial={user}
      isSelf={isSelf}
      onSubmit={onSubmit}
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-medium text-slate-800`}>
            {user.email}
            {isSelf && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                (you)
              </span>
            )}
          </td>
          <td className={`${cellCls} text-slate-700`}>
            {ROLE_LABELS[user.role]}
          </td>
          <td className={`${cellCls} text-xs`}>
            {user.role === "ADMINISTRATOR" ? (
              <span className="text-slate-400 italic">all (admin)</span>
            ) : user.projects.length === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {user.projects.map((p) => (
                  <span
                    key={p.id}
                    title={p.name}
                    className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-800"
                  >
                    {p.displayId}
                  </span>
                ))}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-500`}>
            {new Date(user.createdAt).toLocaleDateString()}
          </td>
        </tr>
      }
    />
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
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
  const { data: users = [] } = useQuery(usersQueryOptions());
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const { onSubmit, errorMessage } = useAdminMutations<UserFormState>({
    entity: "users",
    upsertFn: updateUser,
  });

  return (
    <AdminListPage
      icon={Users}
      title="Users"
      subtitle="Everyone who has signed in to the platform. Click a row to change a user's role or project assignments."
      errorMessage={errorMessage}
      items={users}
      emptyMessage="No users yet. Users appear here after they first sign in."
      columns={["Email", "Role", "Projects", "Joined"]}
      renderRow={(user) => (
        <UserRow
          key={user.id}
          user={user}
          isSelf={user.id === currentUser?.id}
          onSubmit={onSubmit}
        />
      )}
    />
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

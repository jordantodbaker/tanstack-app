import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Th, TableEmptyState } from "~/components/ui/list-page";
import {
  currentUserQueryOptions,
  hasAtLeastRole,
  updateUserRole,
  usersQueryOptions,
  ROLE_LABELS,
  ROLE_RANK,
  type AdminUser,
  type UserRole,
} from "~/utils/users";

export const Route = createFileRoute("/admin/users")({
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
    await context.queryClient.ensureQueryData(usersQueryOptions());
  },
  component: AdminUsersPage,
});

// Derived from ROLE_RANK so new privilege levels appear automatically.
const ROLE_VALUES = Object.keys(ROLE_RANK) as UserRole[];

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery(usersQueryOptions());
  const { data: currentUser } = useQuery(currentUserQueryOptions());

  const setRole = useMutation({
    mutationFn: (input: { userId: number; role: UserRole }) =>
      updateUserRole({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] }),
  });

  return (
    <main className="p-4 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="size-6 text-slate-600" />
          Users
        </h1>
        <p className="text-sm text-slate-500">
          Everyone who has signed in to the platform. Change a user's access
          level with the role dropdown.
        </p>
      </div>

      {setRole.isError && (
        <p className="text-sm text-red-600">
          {(setRole.error as Error).message}
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
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser?.id}
                  disabled={setRole.isPending}
                  onRoleChange={(role) =>
                    setRole.mutate({ userId: user.id, role })
                  }
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
  disabled,
  onRoleChange,
}: {
  user: AdminUser;
  isSelf: boolean;
  disabled: boolean;
  onRoleChange: (role: UserRole) => void;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100";
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className={`${cellCls} font-medium text-slate-800`}>
        {user.email}
        {isSelf && (
          <span className="ml-2 text-xs font-normal text-slate-400">
            (you)
          </span>
        )}
      </td>
      <td className={cellCls}>
        <select
          value={user.role}
          disabled={disabled || isSelf}
          onChange={(e) => onRoleChange(e.target.value as UserRole)}
          title={isSelf ? "You can't change your own role" : undefined}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
        >
          {ROLE_VALUES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </td>
      <td className={`${cellCls} text-slate-500`}>
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

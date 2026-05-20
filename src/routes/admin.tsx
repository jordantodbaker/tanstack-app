import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { currentUserQueryOptions, hasAtLeastRole } from "~/utils/users";

/**
 * Layout route for everything under `/admin`. Its `beforeLoad` is the single
 * place the admin role is enforced for the UI; child routes (e.g.
 * `admin.projects.tsx`) inherit this gate and do not declare their own.
 * Server functions still call `requireAdmin()` so the API is independently
 * protected.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (!user || !hasAtLeastRole(user.role, "ADMINISTRATOR")) {
      throw redirect({ to: "/changelog" });
    }
    // `/admin` itself isn't a page — point it at the first sub-section.
    if (location.pathname === "/admin") {
      throw redirect({ to: "/admin/projects" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}

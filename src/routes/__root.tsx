/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import * as React from "react";

// Devtools load lazily and only render in dev — the `import.meta.env.DEV`
// branch is statically replaced by Vite, so the dynamic `import(...)` is
// dropped entirely from the prod bundle.
const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : () => null;
const TanStackRouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : () => null;
import type { QueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import appCss from "~/styles/app.css?url";
import { seo } from "~/utils/seo";
import { ClerkProvider, useClerk } from "@clerk/tanstack-react-start";
import { UserButton, Show, SignIn } from "@clerk/tanstack-react-start";
import { Sidebar } from "~/components/Sidebar";
import { SelectedProjectProvider } from "~/lib/selected-project";
import { ProjectSelect } from "~/components/ProjectSelect";
import { ProjectGuard } from "~/components/ProjectGuard";
import { useCurrentUser, useIsAdmin } from "~/lib/use-current-user";
import { Button } from "~/components/ui/button";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title:
          "TanStack Start | Type-Safe, Client-First, Full-Stack React Framework",
        description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <ClerkProvider
          publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
        >
          <Show when="signed-out">
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-8">
              <div className="flex flex-col items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Company Logo"
                  className="h-16 w-auto"
                />
                <h1 className="text-2xl font-bold text-slate-800">
                  EPC Manager
                </h1>
                <p className="text-sm text-slate-500">
                  Project Controls Platform
                </p>
              </div>
              <SignIn forceRedirectUrl="/setup" />
            </div>
          </Show>
          <Show when="signed-in">
            <SelectedProjectProvider>
              <SignedInLayout>{children}</SignedInLayout>
            </SelectedProjectProvider>
          </Show>
          <Scripts />
        </ClerkProvider>
      </body>
    </html>
  );
}

/**
 * Explicit sign-out control. Uses `useClerk().signOut` directly rather than
 * Clerk's `<SignOutButton>` (which clones an unstyled default button) so the
 * button is styled consistently and the post-sign-out destination is a real
 * landable route — `/` is redirect-only.
 */
function SignOutControl() {
  const clerk = useClerk();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void clerk.signOut({ redirectUrl: "/changelog" });
      }}
    >
      Sign out
    </Button>
  );
}

function SignedInLayout({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Resolve (and lazily create/bootstrap) the signed-in user's local record
  // so their role is available app-wide via the React Query cache.
  useCurrentUser();
  const isAdmin = useIsAdmin();

  React.useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  const closeSidebar = React.useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <>
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-slate-200 shadow-sm z-40 relative">
          <div className="px-3 md:px-6 h-16 flex items-center gap-2 md:gap-6">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <img
                src="/logo.png"
                alt="Company Logo"
                className="h-8 md:h-9 w-auto"
              />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="font-bold text-slate-800 text-base">
                  Haskell
                </span>
                <span className="text-xs text-slate-400">
                  Project Controls Platform
                </span>
              </div>
            </div>
            <div className="hidden sm:block shrink-0">
              <ProjectSelect
                placeholder="Select project…"
                className="h-9 min-w-50"
              />
            </div>
            <nav className="hidden sm:flex items-center gap-1 flex-1">
              <Link
                to="/changelog"
                className="px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors"
                activeProps={{ className: "text-red-800 bg-red-50" }}
                inactiveProps={{
                  className:
                    "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                }}
                activeOptions={{ exact: true }}
              >
                Change Log
              </Link>
              <Link
                to="/fco-log"
                className="px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors"
                activeProps={{ className: "text-red-800 bg-red-50" }}
                inactiveProps={{
                  className:
                    "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                }}
                activeOptions={{ exact: true }}
              >
                FCO Log
              </Link>
              {isAdmin && (
                <Link
                  to="/setup"
                  className="px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  activeProps={{ className: "text-red-800 bg-red-50" }}
                  inactiveProps={{
                    className:
                      "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                  }}
                  activeOptions={{ exact: true }}
                >
                  Field Estimate Form
                </Link>
              )}
            </nav>
            <div className="shrink-0 flex items-center gap-2 md:gap-3 ml-auto sm:ml-0">
              <UserButton />
              <div className="hidden sm:block">
                <SignOutControl />
              </div>
            </div>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={closeSidebar} />
          <main className="flex-1 overflow-auto bg-slate-50">
            {/* Admin routes don't require a selected project; everything
                else flows through the guard for the not-assigned /
                not-selected screens. */}
            {pathname.startsWith("/admin") ? (
              children
            ) : (
              <ProjectGuard>{children}</ProjectGuard>
            )}
          </main>
        </div>
      </div>
      <React.Suspense fallback={null}>
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
      </React.Suspense>
    </>
  );
}

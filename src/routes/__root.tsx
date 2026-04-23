/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import appCss from "~/styles/app.css?url";
import { seo } from "~/utils/seo";
import { ClerkProvider, SignOutButton } from "@clerk/tanstack-react-start";
import { UserButton, Show, SignIn } from "@clerk/tanstack-react-start";
import { Sidebar } from "~/components/Sidebar";

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
              <SignIn />
            </div>
          </Show>
          <Show when="signed-in">
            <div className="min-h-screen flex flex-col">
              <header className="bg-white border-b border-slate-200 shadow-sm z-10">
                <div className="px-6 h-16 flex items-center gap-6">
                  <div className="flex items-center gap-3 shrink-0">
                    <img
                      src="/logo.png"
                      alt="Company Logo"
                      className="h-9 w-auto"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="font-bold text-slate-800 text-base">
                        Haskell
                      </span>
                      <span className="text-xs text-slate-400">
                        Project Controls Platform
                      </span>
                    </div>
                  </div>
                  <nav className="flex items-center gap-1 flex-1">
                    <Link
                      to="/"
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      activeProps={{ className: "text-red-800 bg-red-50" }}
                      inactiveProps={{ className: "text-slate-600 hover:text-slate-900 hover:bg-slate-100" }}
                      activeOptions={{ exact: true }}
                    >
                      Change Log
                    </Link>
                    <Link
                      to="/fef"
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      activeProps={{ className: "text-red-800 bg-red-50" }}
                      inactiveProps={{ className: "text-slate-600 hover:text-slate-900 hover:bg-slate-100" }}
                      activeOptions={{ exact: true }}
                    >
                      Field Estimate Form
                    </Link>
                  </nav>
                  <div className="shrink-0 flex items-center gap-3">
                    <UserButton />
                    <SignOutButton />
                  </div>
                </div>
              </header>
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-auto bg-slate-50">
                  {children}
                </main>
              </div>
            </div>
            <TanStackRouterDevtools position="bottom-right" />
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </Show>
          <Scripts />
        </ClerkProvider>
      </body>
    </html>
  );
}

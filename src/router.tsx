import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  // Initialize the browser Sentry SDK once, on the client only. `import.meta.env.SSR`
  // is statically replaced by Vite, so the server build eliminates this whole branch —
  // and with it the dynamic import, which keeps the `*.client.*` module out of the
  // server graph (the framework's import-protection plugin forbids it there).
  if (!import.meta.env.SSR) {
    void import('./instrument.client').then((m) => m.initSentryClient())
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Treat data as fresh for 30s by default so remounts and window
        // refocus don't refetch queries that haven't changed. Queries with
        // different needs override this: reference data uses `Infinity`, the
        // notification badge sets its own 30s + `refetchInterval`. Mutations
        // still update the UI immediately — `invalidateQueries` ignores
        // `staleTime`. Matches `defaultPreloadStaleTime` below.
        staleTime: 30 * 1000,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Run each route's loader on link hover (or focus on touch). By the time
    // the user clicks, the data is already in the React Query cache and the
    // page transitions feel instant. Loaders are already idempotent
    // (`ensureQueryData` + `tryPrefetchProjectQuery`) so prefetching a route
    // the user doesn't end up visiting is harmless and stays cached for the
    // next intent.
    defaultPreload: "intent",
    // Treat preloaded data as fresh for 30s so a hover→click→hover→click
    // burst doesn't fire the loader twice. Matches the staleTime we use on
    // most project-scoped query options.
    defaultPreloadStaleTime: 30 * 1000,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
  })
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

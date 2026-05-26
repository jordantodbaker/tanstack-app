import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const queryClient = new QueryClient()

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

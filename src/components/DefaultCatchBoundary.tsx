import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import * as React from 'react'
import * as Sentry from '@sentry/tanstackstart-react'
import { logger } from '~/lib/logger'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  logger.error('route catch boundary', { err: error })

  // React error boundaries "handle" render errors, so Sentry's global handlers
  // never see them — report explicitly. In an effect so it fires once per error
  // (not every render) and only on the client; the server side is already
  // covered by the request middleware.
  React.useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
      <ErrorComponent error={error} />
      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={() => {
            router.invalidate()
          }}
          className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`}
        >
          Try Again
        </button>
        {isRoot ? (
          <Link
            to="/"
            className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`}
          >
            Home
          </Link>
        ) : (
          <Link
            to="/"
            className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`}
            onClick={(e) => {
              e.preventDefault()
              window.history.back()
            }}
          >
            Go Back
          </Link>
        )}
      </div>
    </div>
  )
}

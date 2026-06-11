import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Source-map upload to Sentry — gated on an auth token so it only runs in the
    // Vercel production build; local/dev and token-less CI builds are untouched.
    // `autoInstrumentMiddleware: false` because we capture errors via the manually
    // registered global middleware and run no performance tracing (tracesSampleRate 0).
    ...(process.env.SENTRY_AUTH_TOKEN
      ? sentryTanstackStart({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          autoInstrumentMiddleware: false,
        })
      : []),
  ],
})

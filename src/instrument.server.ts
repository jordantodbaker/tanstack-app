// Server-side Sentry initialization. Imported first in `src/start.ts`, so it runs
// when the server bundle (`dist/server/server.js`) is evaluated — which is exactly
// when `api/handler.js` imports it. Initializing here (rather than via the SDK's
// `--import instrument.server.mjs` flag) keeps Sentry in the *same module realm* as
// the bundled `sentryGlobal*Middleware`, which is what makes server-fn capture work
// under this app's custom Vercel adapter.
import * as Sentry from "@sentry/tanstackstart-react";
import { SHARED_SENTRY_OPTIONS } from "~/lib/sentry-options";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  // No-op cleanly until a DSN is configured (e.g. local dev without Sentry).
  enabled: Boolean(dsn),
  ...SHARED_SENTRY_OPTIONS,
});

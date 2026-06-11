import * as Sentry from "@sentry/tanstackstart-react";
import { SHARED_SENTRY_OPTIONS } from "~/lib/sentry-options";

/**
 * Initialize the browser Sentry SDK. Called once, client-only, from `getRouter`
 * (guarded by `!import.meta.env.SSR`). No `replayIntegration` — Session Replay
 * records the on-screen DOM, which here would capture the sensitive cost /
 * contractor data the rest of this setup is careful to scrub.
 *
 * The DSN is public (DSNs are not secrets), so it ships via a `VITE_`-prefixed env
 * var like the Clerk publishable key.
 */
export function initSentryClient(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    ...SHARED_SENTRY_OPTIONS,
  });
}

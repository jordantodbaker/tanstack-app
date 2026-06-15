import { createServerFn } from "@tanstack/react-start";
import * as Sentry from "@sentry/tanstackstart-react";
import { adminHandlerNoInput } from "./users.server";

/**
 * Deliberately-throwing admin-only server fn used to verify that the Sentry
 * `sentryGlobalFunctionMiddleware` is wired up and actually shipping events
 * to the dashboard. Reached from the "Test server-side Sentry capture" button
 * on Admin → System.
 *
 * The error message is namespaced with `[sentry-smoke]` so it's easy to find
 * — and easy to filter out / discard — in the Sentry issue list. No PII.
 *
 * We `captureException` + `flush` BEFORE throwing so the smoke test works
 * even on Vercel's serverless runtime, where the function teardown can race
 * the SDK's in-flight HTTP POST to ingest.sentry.io. The middleware ALSO
 * captures the throw on its way back up; Sentry dedupes the two events.
 *
 * Admin-gated because firing arbitrary server-side throws is the kind of
 * thing a regular user shouldn't be able to spam.
 */
export const triggerServerSentrySmoke = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(
    adminHandlerNoInput(async (): Promise<never> => {
      const err = new Error(
        `[sentry-smoke] server-side throw at ${new Date().toISOString()} — ` +
          `if you can see this in Sentry, the function middleware is wired up.`,
      );
      Sentry.captureException(err);
      // Wait up to 2 s for the in-flight POST to ingest.sentry.io to settle
      // before the serverless function may be torn down by Vercel. No-op in
      // long-lived dev runs.
      await Sentry.flush(2000);
      throw err;
    }),
  );

/**
 * Diagnostic: returns the server-side Sentry config state so the operator can
 * tell *why* a smoke test came up empty. Specifically: is `SENTRY_DSN` set on
 * the server (separate env var from the client's `VITE_SENTRY_DSN`), did
 * `Sentry.init` actually attach a client to the global hub, etc.
 *
 * Returns no DSN value — just a yes/no for each check — so the result is safe
 * to render in the admin UI.
 */
export type SentryServerStatus = {
  dsnEnvSet: boolean;
  clientInitialized: boolean;
  clientEnabled: boolean;
  dsnTail: string | null;
};

export const getServerSentryStatus = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<SentryServerStatus> => {
    const dsn = process.env.SENTRY_DSN ?? "";
    const client = Sentry.getClient();
    const opts = client?.getOptions();
    return {
      dsnEnvSet: dsn.length > 0,
      clientInitialized: client !== undefined,
      clientEnabled: opts?.enabled ?? false,
      // Tail of the DSN so the operator can confirm it matches the one they
      // pasted into Vercel, without leaking the whole token. DSNs aren't
      // technically secret but there's no reason to render them in full.
      dsnTail: dsn.length > 6 ? `…${dsn.slice(-6)}` : null,
    };
  }),
);

import { createServerFn } from "@tanstack/react-start";
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
 * Admin-gated because firing arbitrary server-side throws is the kind of
 * thing a regular user shouldn't be able to spam.
 */
export const triggerServerSentrySmoke = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(
    adminHandlerNoInput(async (): Promise<never> => {
      throw new Error(
        `[sentry-smoke] server-side throw at ${new Date().toISOString()} — ` +
          `if you can see this in Sentry, the function middleware is wired up.`,
      );
    }),
  );

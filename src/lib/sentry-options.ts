/**
 * Shared Sentry init options for both the browser and server SDKs. Deliberately
 * free of any `@sentry/*` runtime import so it's safe to pull into either bundle;
 * the concrete `Sentry.init` calls live in `instrument.client.ts` /
 * `instrument.server.ts`.
 *
 * Privacy: the app's CVR / FCO free-text fields hold contractor names and internal
 * cost numbers (DEPLOYMENT.md §10). So we never send default PII, never record
 * Session Replay, run no performance tracing, and scrub request bodies / server-fn
 * inputs off every event before it leaves the process.
 */

/** Minimal shape of the fields `scrubEvent` touches on a Sentry event. */
type ScrubbableEvent = {
  request?: { data?: unknown; cookies?: unknown; headers?: unknown };
  user?: { id?: string | number };
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

/**
 * Strip anything that could carry sensitive business data before an event is sent.
 * Returns the event (Sentry's `beforeSend` contract); returning `null` would drop it.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.request) {
    // Request / server-fn bodies can contain CVR / FCO field values.
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  // Free-form context / extra that middleware may attach (e.g. fn args).
  event.contexts = undefined;
  event.extra = undefined;
  // Keep only an opaque user id — no email / IP.
  if (event.user) event.user = { id: event.user.id };
  return event;
}

/** Init options common to client + server. Spread into each `Sentry.init`. */
export const SHARED_SENTRY_OPTIONS = {
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
};

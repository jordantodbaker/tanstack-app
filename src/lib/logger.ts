/**
 * App-wide logging. Two pieces:
 *
 * - `logger.{info,warn,error,debug}` — structured logs that show up in both
 *   environments. Pretty multiline in dev; one-line JSON in prod so a log
 *   collector can parse them later. `logger.error` also forwards to Sentry
 *   (no-op when no DSN is configured) so caught-and-logged errors land in
 *   the same dashboard as thrown ones — without this, the catch-and-log
 *   sites (saveFefRows, basis save, allow-list save, fef persistence) only
 *   make it to stdout.
 * - `createDebug(namespace)` — namespaced no-op-in-prod console wrapper for
 *   noisy dev-only tracing. Replaces ad-hoc `console.log("[ns] ...")` calls.
 *
 * Works on both client and server (process.env.NODE_ENV is statically replaced
 * by Vite on the client and read at runtime on the server).
 */

import * as Sentry from "@sentry/tanstackstart-react";

const IS_PROD =
  typeof process !== "undefined" &&
  process.env?.NODE_ENV === "production";

type Level = "debug" | "info" | "warn" | "error";

type Context = Record<string, unknown> | undefined;

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: err };
}

function emit(level: Level, msg: string, ctx: Context): void {
  const consoleFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  if (IS_PROD) {
    const record: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      msg,
    };
    if (ctx) {
      for (const [k, v] of Object.entries(ctx)) {
        record[k] = v instanceof Error ? serializeError(v) : v;
      }
    }
    consoleFn(JSON.stringify(record));
    return;
  }

  if (ctx) {
    consoleFn(`[${level}] ${msg}`, ctx);
  } else {
    consoleFn(`[${level}] ${msg}`);
  }
}

/**
 * Forward an error-level log to Sentry in addition to stdout. Sentry's
 * middleware already captures *thrown* errors from server fns and SSR; this
 * covers the caught-and-logged path where the error is handled but still
 * worth alerting on (e.g. a debounced FEF save that failed but won't bubble
 * to a catch boundary). No-op when no DSN is configured — Sentry's SDK is
 * built that way.
 *
 * Looks for `ctx.err` / `ctx.error` since that's the convention every
 * existing `logger.error(...)` callsite already uses. Falls back to
 * `captureMessage` so a context-less error log still produces a Sentry
 * event grouped by `msg`.
 */
function forwardErrorToSentry(msg: string, ctx: Context): void {
  const err =
    (ctx?.err as unknown) ?? (ctx?.error as unknown) ?? undefined;
  if (err instanceof Error) {
    Sentry.captureException(err, { extra: { msg, ...ctx } });
    return;
  }
  Sentry.captureMessage(msg, { level: "error", extra: ctx });
}

export const logger = {
  debug(msg: string, ctx?: Context): void {
    if (IS_PROD) return;
    emit("debug", msg, ctx);
  },
  info(msg: string, ctx?: Context): void {
    emit("info", msg, ctx);
  },
  warn(msg: string, ctx?: Context): void {
    emit("warn", msg, ctx);
  },
  error(msg: string, ctx?: Context): void {
    emit("error", msg, ctx);
    forwardErrorToSentry(msg, ctx);
  },
};

/**
 * Returns a logger function tagged with `namespace`. No-ops in production.
 * Use for high-volume / per-keystroke dev tracing that would spam prod.
 *
 *   const debug = createDebug("fef");
 *   debug("updateData", { rowIndex });   // dev: "[fef] updateData {...}"
 *                                        // prod: no-op
 */
export function createDebug(
  namespace: string,
): (msg: string, ctx?: Context) => void {
  if (IS_PROD) {
    return () => {};
  }
  return (msg, ctx) => {
    if (ctx) {
      console.log(`[${namespace}] ${msg}`, ctx);
    } else {
      console.log(`[${namespace}] ${msg}`);
    }
  };
}

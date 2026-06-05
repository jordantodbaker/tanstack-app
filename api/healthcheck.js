// Liveness + readiness healthcheck.
//
// Pings the database via `pg` (no Prisma — we want this endpoint to keep
// working even if the application bundle is broken). Returns JSON with the
// status of each check and an HTTP status code an uptime monitor can act on:
//   200 — all checks pass
//   503 — one or more checks failed
//
// vercel.json's catch-all rewrite to /api/handler uses a negative lookahead
// so requests to /api/healthcheck reach this function directly instead of
// being routed through the TanStack Start SSR bundle. That keeps the cold-
// start cost low (every 1-5 min ping by an uptime monitor adds up) and
// isolates the healthcheck from any app-side regression.

import { Client } from "pg";

const STARTED_AT = Date.now();

export default async function handler(req, res) {
  const startedAt = Date.now();
  const result = {
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    checks: {
      db: await checkDb(),
    },
    timestamp: new Date().toISOString(),
    durationMs: 0,
  };
  result.durationMs = Date.now() - startedAt;
  if (!result.checks.db.ok) result.status = "error";

  // Surface useful response semantics for uptime monitors:
  //   - status code drives the monitor's alert
  //   - Cache-Control: no-store prevents any CDN from caching a stale OK
  res.statusCode = result.status === "ok" ? 200 : 503;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end(JSON.stringify(result));
}

async function checkDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return { ok: false, error: "DATABASE_URL is not set" };
  }
  const client = new Client({ connectionString });
  const start = Date.now();
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    // Don't leak the connection string or stack — uptime monitors don't need
    // it and this endpoint is unauthenticated.
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: shortMessage(err),
    };
  } finally {
    // `end` is best-effort; if `connect` failed there may be nothing to close.
    await client.end().catch(() => {});
  }
}

/** First line of an error message; caps length so the response stays small. */
function shortMessage(err) {
  const raw = err?.message ?? String(err);
  const firstLine = raw.split("\n", 1)[0];
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "…" : firstLine;
}

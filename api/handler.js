// Vercel Node serverless function that bridges Vercel's Node req/res to the
// Web Fetch handler exported by the TanStack Start server bundle.
//
// Flow per request:
//   Vercel → Node req/res
//          → build a `Request` from the Node req
//          → server.fetch(request) returns a `Response`
//          → pipe Response body to Node res
//
// This exists because the installed TanStack Start version (1.167) has no
// built-in Vercel adapter; the build emits `dist/server/server.js` whose
// default export is `{ fetch(request): Promise<Response> }`.
//
// vercel.json rewrites every non-static path to `/api/handler`, so this is
// the single entry point for all SSR + server-fn traffic. Static assets are
// served directly from `dist/client/` via `outputDirectory`.

import server from "../dist/server/server.js";

export default async function handler(req, res) {
  try {
    const request = nodeReqToWebRequest(req);
    const response = await server.fetch(request);
    await pipeWebResponseToNode(response, res);
  } catch (err) {
    // Last-resort error path so the function doesn't return a blank 500 with
    // no logs. Real app errors should already be handled inside the
    // TanStack Start handler; this catches handler-or-adapter bugs.
    console.error("[api/handler] failed:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end(err?.stack ?? String(err));
  }
}

function nodeReqToWebRequest(req) {
  // Vercel forwards the original scheme/host through these headers. Falling
  // back to "https" + `host` is safe in production; both are always present.
  const proto = headerValue(req.headers["x-forwarded-proto"]) || "https";
  const host = headerValue(req.headers["x-forwarded-host"]) || req.headers.host;
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else {
      headers.set(name, value);
    }
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // `duplex: 'half'` is required when constructing a Request from a Node
    // readable stream under Node ≥ 18.
    init.body = req;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function pipeWebResponseToNode(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

function headerValue(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

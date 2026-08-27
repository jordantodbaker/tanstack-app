import { openApp } from "./session.mjs";

/**
 * What a page navigation actually costs: every server call it makes, when, how
 * big, and whether any are true duplicates.
 *
 *   node scripts/browser/measure-load.mjs piping         # full page load
 *   node scripts/browser/measure-load.mjs piping --nav   # in-app link click
 *
 * The database is Neon (Postgres over the network), where even a trivial query
 * costs a round trip. That makes the COUNT and SEQUENCING of server calls
 * matter more than the size of any one payload.
 *
 * Two traps this script exists to avoid, both of which produced false
 * "duplicate fetch" findings before it did:
 *
 *  1. `openApp()` lands on "/" to set up Clerk. Its calls are still in flight
 *     when the next navigation starts, and get attributed to it. So the log is
 *     cleared only after "/" has fully settled.
 *
 *  2. Grouping calls by MODULE conflates distinct server functions that live
 *     in the same file — `utils/piping.ts` exports two no-arg queries, so it
 *     legitimately appears twice. Only (module + payload) identifies a call,
 *     and even that cannot separate two no-arg functions in one module, so
 *     repeats are reported as SUSPECTED and need checking by hand.
 *
 * A full page load is served by SSR with dehydrated query data and refetches
 * almost nothing; `--nav` is the case where the client fetches for itself.
 */

const route = (process.argv[2] ?? "piping").replace(/^\/+/, "");
const useNav = process.argv.includes("--nav");

const app = await openApp();
const { page, goto, consoleErrors } = app;

let calls = [];
// Keyed on the Request OBJECT, not the URL: the module id is base64 inside the
// path, so URL substring matching cannot pair a response with its request.
const byRequest = new Map();

page.on("request", (r) => {
  const u = r.url();
  if (!/_serverFn/.test(u)) return;
  let file = "?";
  try {
    const seg = u.match(/_serverFn\/([^?/]+)/)[1];
    file = JSON.parse(Buffer.from(decodeURIComponent(seg), "base64").toString("utf8")).file;
  } catch {
    /* module id not decodable — keep the placeholder */
  }
  const call = {
    mod: file.replace(/^.*\/src\/utils\//, "").replace(/\?.*$/, ""),
    payload: new URL(u).searchParams.get("payload") ?? "",
    start: Date.now(),
    end: null,
    size: 0,
  };
  byRequest.set(r, call);
  calls.push(call);
});

page.on("response", async (r) => {
  const call = byRequest.get(r.request());
  if (!call) return;
  call.end = Date.now();
  try {
    call.size = (await r.body()).length;
  } catch {
    /* body already consumed or the request was redirected */
  }
});

try {
  // Let the bootstrap page finish before anything is attributed to the route.
  await page.waitForTimeout(4000);
  calls = [];

  const t0 = Date.now();
  if (useNav) {
    await page.locator(`a[href="/${route}"]`).first().click();
    await page.waitForTimeout(4000);
  } else {
    await goto(route);
  }
  const wall = Date.now() - t0;

  const done = calls.filter((c) => c.end !== null);
  console.log(`\n${useNav ? "in-app navigation" : "full page load"} → /${route}`);
  console.log(`${calls.length} server calls, ${wall}ms wall\n`);

  const base = calls.length ? Math.min(...calls.map((c) => c.start)) : 0;
  for (const c of calls.sort((a, b) => a.start - b.start)) {
    const dur = c.end ? `${c.end - c.start}ms` : "—";
    const kb = c.size ? `${Math.round(c.size / 1024)}KB` : "";
    console.log(
      `  +${String(c.start - base).padStart(5)}ms  ${dur.padStart(7)} ${kb.padStart(6)}  ` +
        `${c.mod.padEnd(20)} ${c.payload.slice(0, 90)}`,
    );
  }

  const seen = new Map();
  for (const c of calls) {
    const k = `${c.mod} :: ${c.payload}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const repeats = [...seen].filter(([, n]) => n > 1);
  console.log(`\ndistinct (module + payload): ${seen.size}`);
  if (repeats.length === 0) {
    console.log("no repeated calls.");
  } else {
    console.log(`SUSPECTED duplicates (confirm the module has only one such fn):`);
    for (const [k, n] of repeats) console.log(`  ${n}x  ${k.slice(0, 160)}`);
  }

  if (done.length > 1) {
    const span = Math.max(...done.map((c) => c.end)) - base;
    const serial = done.reduce((n, c) => n + (c.end - c.start), 0);
    console.log(
      `\nfirst call → last response: ${span}ms; sum of durations: ${serial}ms ` +
        `(${(serial / span).toFixed(1)}× overlap)`,
    );
  }

  console.log(consoleErrors.length ? `\nconsole errors: ${consoleErrors.length}` : "\nno console errors.");
} finally {
  await app.close();
}

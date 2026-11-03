import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every server function names its gate.
 *
 * `createServerFn` handlers are plain HTTP endpoints. The Clerk middleware in
 * `start.ts` attaches the auth state to the request but never requires a
 * session, and route-level guards only decide what the browser renders — so a
 * handler with no check of its own answers anyone who can reach the host,
 * signed in or not, for any project. That is how `fetchAreas` came to list
 * every project's areas and `fetchRoleData` to hand out any project's rate
 * overrides. `users.server.test.ts` proves the guards work; nothing proved
 * they were applied. This scan does.
 *
 * A handler passes when the text between its `createServerFn(` and the next
 * top-level declaration mentions a guard: one of the `*Handler` wrappers, a
 * `require*` call, `resolveCurrentUser`, or one of the shared helpers that
 * run the check inside themselves (the entity read/write generics and the
 * like). It is a tripwire, not a proof — a token in a comment would satisfy
 * it — but it turns "forgot the guard" from silent into a failing test.
 *
 * The allowlist is for the handful of endpoints that are open on purpose.
 * Each entry says why; add to it only with a reason that would survive a
 * review.
 */

const SRC_DIR = join(process.cwd(), "src");

/** Names whose presence in a handler marks it as guarded. */
const GUARD_TOKENS = [
  // Structural wrappers (users.server.ts).
  "adminHandler",
  "adminHandlerNoInput",
  "signedInHandler",
  "signedInHandlerNoInput",
  "projectScopedHandler",
  "projectIdScopedHandler",
  "versionScopedHandler",
  // Inline guards (users.server.ts).
  "requireAdmin",
  "requireRole",
  "requireUser",
  "requireProjectAccess",
  "requireVersionAccess",
  "requireRecordAccess",
  "resolveCurrentUser",
  "getAccessibleProjectIds",
  // Shared helpers that run the check inside themselves.
  "fetchProjectScopedList", // entity-reads.server.ts
  "fetchRecordById", // entity-reads.server.ts
  "upsertProjectScopedRecord", // entity-writes.server.ts
  "transitionProjectScopedRecord", // entity-writes.server.ts
  "deleteProjectScopedRecord", // entity-writes.server.ts
  "requireDefAccess", // customFields.ts
  "requireUserId", // notifications.ts
  "listUsers", // users.server.ts, admin-gated
  "setUser", // users.server.ts, admin-gated
];

/**
 * Endpoints that are open by design, as `file:name`. The two cookie readers
 * return a number from the request's own cookie and touch nothing else; the
 * cron entry point is gated by `CRON_SECRET` because its caller has no user.
 */
const OPEN_BY_DESIGN = new Map<string, string>([
  ["src/utils/projectCookie.ts:getProjectIdFromCookie", "reads its own cookie"],
  ["src/utils/versionCookie.ts:getVersionIdFromCookie", "reads its own cookie"],
  ["src/utils/reminders.ts:runRemindersCronFn", "CRON_SECRET header check"],
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated") continue;
      out.push(...sourceFiles(p));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

/** `export const NAME = createServerFn(` or the unexported form. */
const SERVER_FN = /^(?:export )?const (\w+) = createServerFn\(/gm;
/** Where the next top-level declaration starts — the end of a handler. */
const NEXT_DECLARATION =
  /^(?:export )?(?:const|let|function|async function|type|interface|class) /m;

type ServerFn = { file: string; name: string; line: number; body: string };

function serverFunctions(): ServerFn[] {
  const out: ServerFn[] = [];
  for (const file of sourceFiles(SRC_DIR)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(SERVER_FN)) {
      const start = m.index + m[0].length;
      const rest = text.slice(start);
      const next = rest.search(NEXT_DECLARATION);
      out.push({
        file: relative(process.cwd(), file).replace(/\\/g, "/"),
        name: m[1],
        line: text.slice(0, m.index).split("\n").length,
        body: next === -1 ? rest : rest.slice(0, next),
      });
    }
  }
  return out;
}

describe("server function guards", () => {
  const fns = serverFunctions();

  it("finds the server functions", () => {
    // A regression in the scan itself would otherwise pass vacuously.
    expect(fns.length).toBeGreaterThan(100);
  });

  it("every server function names a guard, or is open by design", () => {
    const offenders = fns
      .filter((fn) => !OPEN_BY_DESIGN.has(`${fn.file}:${fn.name}`))
      .filter((fn) => !GUARD_TOKENS.some((t) => fn.body.includes(t)))
      .map(
        (fn) =>
          `${fn.file}:${fn.line} ${fn.name} has no guard — wrap it in ` +
          `signedInHandler / adminHandler / projectScopedHandler, or call ` +
          `requireUser() / requireProjectAccess() first.`,
      );
    expect(offenders).toEqual([]);
  });

  it("the allowlist names only endpoints that still exist", () => {
    const present = new Set(fns.map((fn) => `${fn.file}:${fn.name}`));
    const stale = [...OPEN_BY_DESIGN.keys()].filter((k) => !present.has(k));
    expect(stale).toEqual([]);
  });
});

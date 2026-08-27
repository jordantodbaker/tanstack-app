import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

/**
 * Regenerates the Prisma client when `schema.prisma` is newer than it.
 *
 * Runs as `predev`. It exists because a schema change that hasn't been
 * generated shows up as a Prisma model reading `undefined` —
 * "Cannot read properties of undefined (reading 'findMany')" — which looks
 * like a code bug and isn't.
 *
 * What this does NOT fix, and nothing at startup can: a dev server that was
 * already running when the schema changed. That process holds the old client in
 * memory, and the only cure is restarting it — at which point this script has
 * run anyway. If a model is undefined at runtime, restart before debugging.
 *
 * Note it is specifically NOT about Vite's cache. `node_modules/.vite` holds the
 * pre-bundled Prisma *runtime*, not the generated models; those live under
 * `src/generated/prisma` as aliased source and are transformed per process, so
 * clearing that cache never had anything to do with this.
 */

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma/schema.prisma");
// Always emitted by the generator, so its mtime is the client's.
const CLIENT_STAMP = join(ROOT, "src/generated/prisma/internal/class.ts");

/** mtime in ms, or null when the path isn't there. */
function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

const schemaAt = mtime(SCHEMA);
if (schemaAt === null) process.exit(0); // No schema — not this kind of project.

const clientAt = mtime(CLIENT_STAMP);
if (clientAt !== null && clientAt >= schemaAt) process.exit(0); // Up to date.

console.log(
  clientAt === null
    ? "[predev] No generated Prisma client — generating."
    : "[predev] schema.prisma is newer than the generated client — regenerating.",
);
try {
  execFileSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} catch {
  // Don't block the dev server: the generate may fail for reasons that have
  // nothing to do with starting up (no network on a first run, say), and a
  // stale-but-working client is better than no dev server at all.
  console.warn(
    "[predev] prisma generate failed — starting anyway. Run it by hand if a model comes back undefined.",
  );
}

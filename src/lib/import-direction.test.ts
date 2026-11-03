import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `src/lib` and `src/config` are the pure side of the codebase: logic and
 * data that server functions, routes and components all read. `src/utils`
 * holds the server functions. The direction is one way — utils reads lib,
 * never the reverse — or a pure module pulls a server function's whole
 * import graph in behind it, and a cycle through `db.ts` follows. That is
 * how a 16-module runtime cycle formed before 2026-11-03.
 *
 * This scan holds the line. A type-only import is fine (erased at build);
 * a value import from `~/utils/` or `../utils/` is not, unless the module is
 * on the allowlist: the few lib hooks that exist to wrap a server function's
 * query options, which is the one legitimate reason to reach across.
 */

const SRC_DIR = join(process.cwd(), "src");

/** Lib modules whose purpose is to wrap a server function's query. */
const WRAPS_A_SERVER_FUNCTION = new Set([
  "src/lib/custom-columns-context.tsx",
  "src/lib/selected-version.tsx",
  "src/lib/use-current-user.ts",
  "src/lib/use-fef-row-persistence.ts",
  "src/lib/use-record-recent-view.ts",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

/** A value import from utils; `import type` is excluded by the leading group. */
const UTILS_VALUE_IMPORT =
  /^import\s+(?!type\s)[^;]*?\sfrom\s+"(?:~|\.\.)\/utils\/[^"]+";/gm;

describe("import direction", () => {
  it("lib and config never import a value from utils", () => {
    const offenders: string[] = [];
    for (const dir of ["lib", "config"]) {
      for (const file of sourceFiles(join(SRC_DIR, dir))) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        if (WRAPS_A_SERVER_FUNCTION.has(rel)) continue;
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(UTILS_VALUE_IMPORT)) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(
            `${rel}:${line} imports a value from utils — move what it ` +
              `needs into lib or config, or use \`import type\`.`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist names only modules that still exist", () => {
    for (const rel of WRAPS_A_SERVER_FUNCTION) {
      expect(() => statSync(join(process.cwd(), rel))).not.toThrow();
    }
  });
});

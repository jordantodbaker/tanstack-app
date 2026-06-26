import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against the regression that broke the dashboard: an **exported,
 * module-scope function that uses `prisma`** in a client-reachable module.
 *
 * The codebase's invariant is that prisma only ever runs inside
 * `createServerFn().handler(...)` bodies (which the tanstack-start client
 * transform strips) or inside non-exported helpers (dead-stripped once the
 * handlers are removed) or inside `*.server.ts` files (which client code never
 * imports). An *exported* `function foo() { prisma… }` defeats all three: it's
 * public API, so the transform can't drop it, and it drags the Node-only
 * Prisma client into the browser bundle — which crashes hydration in dev.
 *
 * Nothing else catches this: `tsc` is happy, unit tests don't import it, and
 * the *production* build tree-shakes it out so a `dist/client` grep is clean
 * too — the leak only shows up in `vite dev`. This static scan does.
 *
 * Note: matches `export [async] function NAME(...)` declarations only. Prisma
 * inside `export const x = createServerFn().handler(...)` is fine (that's a
 * const, not a function declaration) and intentionally not flagged.
 */

const SRC_DIR = join(process.cwd(), "src");

/** All first-party source files that ARE part of the client graph. */
function clientReachableFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated") continue; // generated prisma client
      out.push(...clientReachableFiles(p));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    if (/\.server\.ts$/.test(name)) continue; // server-only; client never imports
    if (name === "routeTree.gen.ts") continue; // generated
    out.push(p);
  }
  return out;
}

/** Names of `export [async] function` declarations whose body references
 *  `prisma.`. Body is found by brace-matching from the signature's open brace.
 *  Exported so the self-check below can prove it isn't a vacuous pass. */
export function exportedPrismaFunctions(src: string): string[] {
  const offenders: string[] = [];
  const re = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const parenEnd = src.indexOf(")", m.index);
    if (parenEnd === -1) continue;
    const open = src.indexOf("{", parenEnd);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        i++;
        break;
      }
    }
    if (/\bprisma\./.test(src.slice(open, i))) offenders.push(m[1]);
  }
  return offenders;
}

describe("no prisma in client-reachable modules", () => {
  it("has no exported module-scope function that uses prisma", () => {
    const offenders: string[] = [];
    for (const file of clientReachableFiles(SRC_DIR)) {
      const rel = file.slice(SRC_DIR.length + 1).replace(/\\/g, "/");
      for (const fn of exportedPrismaFunctions(readFileSync(file, "utf8"))) {
        offenders.push(`src/${rel}: export function ${fn}() uses prisma`);
      }
    }
    // If this fails: move the prisma call into the createServerFn handler, make
    // the helper non-exported, or relocate it to a *.server.ts module.
    expect(offenders).toEqual([]);
  });

  // Prove the detector actually fires — otherwise the guard above could pass
  // vacuously (e.g. a broken regex) and silently stop protecting anything.
  it("self-check: flags the anti-pattern, ignores the safe forms", () => {
    // The exact shape that broke the dashboard.
    expect(
      exportedPrismaFunctions(
        "export async function loadX(id: number) {\n return prisma.fefRow.findMany({ where: { id } });\n}",
      ),
    ).toEqual(["loadX"]);

    // Safe: prisma inside a createServerFn handler (a const, not a fn decl).
    expect(
      exportedPrismaFunctions(
        "export const fetchX = createServerFn().handler(async () => prisma.x.findMany());",
      ),
    ).toEqual([]);
    // Safe: non-exported helper (gets dead-stripped on the client).
    expect(
      exportedPrismaFunctions("async function loadY() { return prisma.y.findMany(); }"),
    ).toEqual([]);
    // Safe: exported but pure.
    expect(
      exportedPrismaFunctions("export function pure(n: number) { return n + 1; }"),
    ).toEqual([]);
  });
});

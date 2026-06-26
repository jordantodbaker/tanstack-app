/**
 * Dev client-bundle leak check.
 *
 * Runs Vite's *client* transform (the same pipeline `vite dev` serves to the
 * browser) over every first-party data module and fails if any of them still
 * imports a server-only module — `/src/server/db.ts`, the generated Prisma
 * client, or `@prisma/client`. That's the regression that broke the dashboard:
 * an exported module-scope prisma function survived the client transform and
 * pulled the Node-only Prisma client into the browser, crashing hydration in
 * dev. `tsc`, the unit suite, and even the production build (which tree-shakes)
 * all miss it; this catches it because it inspects the un-tree-shaken dev
 * transform, the same thing the browser loads.
 *
 * More robust than the static `no-prisma-in-client.test.ts` heuristic: it sees
 * the actual transformed imports, so it also catches exported arrow-fn helpers
 * and transitive shapes the source scan can't.
 *
 *   tsx scripts/check-client-leak.ts        (also: npm run check:client-leak)
 */
import { createServer } from "vite";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const FORBIDDEN =
  /\/src\/server\/db(\.ts)?\b|\/src\/generated\/prisma|@prisma\/client|\bPrismaClient\b/;

/** First-party `.ts` modules that ARE part of the client graph (exclude
 *  server-only, generated, and tests — clients never import those). */
function clientModules(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated") continue;
      out.push(...clientModules(p));
      continue;
    }
    if (!name.endsWith(".ts")) continue; // .tsx components rarely touch prisma
    if (name.endsWith(".test.ts")) continue;
    if (name.endsWith(".server.ts")) continue;
    if (name === "routeTree.gen.ts") continue;
    out.push(p);
  }
  return out;
}

async function main(): Promise<void> {
  const modules = [
    ...clientModules(join(ROOT, "src", "utils")),
    ...clientModules(join(ROOT, "src", "lib")),
  ];

  const server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const leaks: string[] = [];
  let scanned = 0;
  try {
    for (const file of modules) {
      const url = "/" + relative(ROOT, file).replace(/\\/g, "/");
      let result;
      try {
        result = await server.transformRequest(url, { ssr: false });
      } catch {
        continue; // a module that won't transform standalone can't be a leak vector here
      }
      if (!result) continue;
      scanned++;
      if (FORBIDDEN.test(result.code)) leaks.push(url);
    }
  } finally {
    await server.close();
  }

  if (leaks.length > 0) {
    console.error(
      `\n✗ Server-only code leaked into the CLIENT transform of ${leaks.length} module(s):`,
    );
    for (const l of leaks) console.error("  - " + l);
    console.error(
      "\nKeep prisma inside createServerFn handlers / non-exported helpers / *.server.ts.\n" +
        "An exported module-scope prisma function is the usual cause.\n",
    );
    process.exit(1);
  }
  console.log(`✓ client transforms clean (${scanned} modules scanned)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ADMIN_ENTITIES, invalidateAdminEntity } from "./admin-invalidations";

/**
 * Guard against invalidating an admin cache key by hand instead of going
 * through `invalidateAdminEntity`.
 *
 * The fan-out exists because several admin caches travel together: deleting an
 * Area has to bust `["areas"]` (the admin list) AND `["areasByProject"]` (the
 * per-project dropdown, which every Take Off page and entity dialog reads).
 * They're separate keys, and `areasByProject` is `staleTime: Infinity`, so
 * missing it means the deleted area keeps showing until a hard refresh.
 *
 * That is exactly what `ProjectDialog`'s inline area delete did — it busted
 * `["areas"]` alone. `admin-invalidations.test.ts` couldn't catch it because
 * the FAN_OUT map itself was correct; the bug was a callsite that never
 * consulted it. This scan checks the callsites.
 *
 * A bare single-key `invalidateQueries({ queryKey: ["x"] })` is only a problem
 * when `x` is a key some admin entity fans out from. Keys outside the fan-out
 * (`["notifications"]`, `["snapshots", id]`, …) are unrelated and ignored.
 */

const SRC_DIR = join(process.cwd(), "src");

/** Every cache key reachable through the fan-out, derived from the real map. */
function fannedOutKeys(): Set<string> {
  const keys = new Set<string>();
  const queryClient = {
    invalidateQueries: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
      keys.add(String(queryKey[0]));
    }),
  } as never;
  for (const entity of ADMIN_ENTITIES) {
    invalidateAdminEntity(queryClient, entity);
  }
  return keys;
}

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
    // The fan-out helper itself is the one place allowed to do this.
    if (name === "admin-invalidations.ts") continue;
    out.push(p);
  }
  return out;
}

/** `invalidateQueries({ queryKey: ["someKey"] })` — the single-key form. */
const BARE_INVALIDATE =
  /invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*"([A-Za-z0-9_]+)"\s*\]\s*,?\s*\}\s*\)/g;

describe("admin cache invalidation callsites", () => {
  it("routes every fanned-out key through invalidateAdminEntity", () => {
    const fanned = fannedOutKeys();
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(BARE_INVALIDATE)) {
        if (!fanned.has(m[1])) continue;
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(
          `${relative(process.cwd(), file)}:${line} invalidates ["${m[1]}"] ` +
            `directly — use invalidateAdminEntity() so its companion caches ` +
            `(e.g. areasByProject) are busted too.`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("self-check: the scan recognizes the pattern it is looking for", () => {
    // Guards against the regex silently matching nothing forever.
    const sample = `queryClient.invalidateQueries({ queryKey: ["areas"] });`;
    const hits = [...sample.matchAll(BARE_INVALIDATE)].map((m) => m[1]);
    expect(hits).toEqual(["areas"]);
    expect(fannedOutKeys().has("areas")).toBe(true);
    expect(fannedOutKeys().has("areasByProject")).toBe(true);
  });

  it("self-check: an unrelated key is not flagged", () => {
    expect(fannedOutKeys().has("notifications")).toBe(false);
    expect(fannedOutKeys().has("snapshots")).toBe(false);
  });
});

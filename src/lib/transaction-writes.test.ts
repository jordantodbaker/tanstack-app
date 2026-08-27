import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard against a write escaping the transaction it looks like it is inside.
 *
 * Inside `prisma.$transaction(async (tx) => { … })`, only `tx` is enrolled in
 * the transaction. A `prisma.something.update(…)` in that same block runs on a
 * separate connection: it commits immediately and SURVIVES a rollback. The
 * code reads as atomic and is not.
 *
 * That matters here because the transactions in this codebase exist for
 * exactly that guarantee — `applyVersionRateRefresh` re-rates a whole revision
 * and must never leave it half done, and the shared write paths in
 * `entity-writes.server.ts` deliberately read-and-authorize inside the
 * transaction so access cannot change underneath them. A single stray
 * `prisma.` in either would undo the reason the transaction is there, silently
 * and without failing a test.
 *
 * Every callback in the codebase names its parameter `tx` (29 of 29), so the
 * rule is simply: no bare `prisma.<model>.<write>` between the braces.
 *
 * KNOWN BLIND SPOT: this is lexical. A helper called from inside a transaction
 * that uses module-level `prisma` is invisible to it — `loadRefreshInputs` in
 * `rateRefresh.ts` does precisely that, though only for reads. Passing the
 * client down is the fix when a helper needs to write; this scan will not tell
 * you about it.
 */

const SRC_DIR = join(process.cwd(), "src");

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

const TX_OPEN = /\$transaction\(\s*async\s*\(\s*tx\b/g;

/** A Prisma write on the bare client: `prisma.fefRow.updateMany(`. */
const BARE_WRITE =
  /\bprisma\s*\.\s*([A-Za-z0-9_]+)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|executeRaw|executeRawUnsafe)\b/g;

/**
 * The span of the transaction callback that starts at `from`, by brace depth.
 *
 * Counts braces only; a `{` inside a string or comment would skew it. In this
 * codebase that has not come up, and the failure mode is a wider or narrower
 * span rather than a wrong verdict on code that is actually there.
 */
function callbackSpan(text: string, from: number): [number, number] {
  const start = text.indexOf("{", from);
  if (start === -1) return [from, from];
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return [start, i];
  }
  return [start, text.length];
}

/** Every bare-client write lexically inside a transaction callback. */
export function findEscapedWrites(text: string): { model: string; op: string; offset: number }[] {
  const found: { model: string; op: string; offset: number }[] = [];
  for (const open of text.matchAll(TX_OPEN)) {
    const [start, end] = callbackSpan(text, open.index!);
    const body = text.slice(start, end);
    for (const w of body.matchAll(BARE_WRITE)) {
      found.push({ model: w[1], op: w[2], offset: start + w.index! });
    }
  }
  return found;
}

/**
 * `pickDelegate: (tx) => tx.area` — how the shared write paths in
 * `entity-writes.server.ts` receive their model.
 *
 * Those paths contain no literal `tx.<model>.<op>` of their own, so the scan
 * above cannot see them: the client arrives through this callback, from a
 * callsite in another file. Handing it `prisma.area` instead type-checks
 * (the delegates are structurally alike) and quietly takes the delete, the
 * transition, or the upsert out of its transaction — including the
 * read-and-authorize step those paths run inside it.
 */
const PICK_DELEGATE = /pickDelegate:\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*=>\s*([A-Za-z0-9_]+)\s*\./g;

/** Delegates resolved from something other than the callback's own client. */
export function findDetachedDelegates(
  text: string,
): { param: string; from: string; offset: number }[] {
  const found: { param: string; from: string; offset: number }[] = [];
  for (const m of text.matchAll(PICK_DELEGATE)) {
    if (m[2] !== m[1]) found.push({ param: m[1], from: m[2], offset: m.index! });
  }
  return found;
}

describe("transaction writes", () => {
  it("never writes through the bare client inside a transaction", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, "utf8");
      for (const { model, op, offset } of findEscapedWrites(text)) {
        const line = text.slice(0, offset).split("\n").length;
        offenders.push(
          `${relative(process.cwd(), file)}:${line} — prisma.${model}.${op}() ` +
            `inside a $transaction callback; use tx.${model}.${op}()`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("resolves every shared-write delegate from the transaction client", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, "utf8");
      for (const { param, from, offset } of findDetachedDelegates(text)) {
        const line = text.slice(0, offset).split("\n").length;
        offenders.push(
          `${relative(process.cwd(), file)}:${line} — pickDelegate resolves ` +
            `from \`${from}\`, not the callback's \`${param}\``,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("detects a delegate taken from the bare client", () => {
    const bad = `deleteProjectScopedRecord({ pickDelegate: (tx) => prisma.area })`;
    expect(findDetachedDelegates(bad)).toEqual([
      expect.objectContaining({ param: "tx", from: "prisma" }),
    ]);
    expect(findDetachedDelegates(`pickDelegate: (tx) => tx.area,`)).toEqual([]);
  });

  it("detects an escaped write", () => {
    // Proves the scan above is looking, rather than passing because the regex
    // never matches anything.
    const bad = `
      await prisma.$transaction(async (tx) => {
        const row = await tx.fefRow.findFirst({ where: { id } });
        await prisma.fefRow.updateMany({ data: { laborRate: "1" } });
      });
    `;
    expect(findEscapedWrites(bad)).toEqual([
      expect.objectContaining({ model: "fefRow", op: "updateMany" }),
    ]);
  });

  it("leaves writes outside the callback alone", () => {
    // A bare write AFTER the transaction closes is ordinary code.
    const fine = `
      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id }, data });
      });
      await prisma.auditEvent.createMany({ data: entries });
    `;
    expect(findEscapedWrites(fine)).toEqual([]);
  });

  it("does not flag reads on the bare client", () => {
    // Deliberate: `loadRefreshInputs` reads via `prisma` from inside a
    // transaction. Reads do not break atomicity, so flagging them would make
    // this scan noisy enough to start ignoring.
    const reads = `
      await prisma.$transaction(async (tx) => {
        const rows = await prisma.fefRow.findMany({ where: { versionId } });
        await tx.fefRow.updateMany({ where: {}, data: {} });
      });
    `;
    expect(findEscapedWrites(reads)).toEqual([]);
  });
});

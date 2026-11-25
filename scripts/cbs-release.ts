// A CBS update, start to finish: expand the master, run the drift guards, show
// what each database would change, ask, import, sync piping, and confirm.
//
// Run:  npm run cbs:release [-- options]
//
//   --dry-run            plan only, write nothing to any database
//   --target=local       one database; local, stage, or local,stage (default)
//   --legacy             also reload LegacyCBS.xlsx
//   --skip-expand        use the CBS.xlsx on disk
//   --yes=local          consent up front, per target, instead of being asked
//
// The connection strings come from `.env.cbs` (git-ignored, and separate from
// `.env`, which `vercel env pull` rewrites):
//
//   CBS_DB_LOCAL="postgresql://…"
//   CBS_DB_STAGE="postgresql://…"
//
// Each step is the existing script in its own process with DATABASE_URL set
// for it, so this never depends on which line of `.env` is uncommented. It
// does not push schema changes: if a table is missing, the plan step fails
// before anything is written.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parse } from "dotenv";
import {
  cbsReleaseConsented,
  parseCbsReleaseArgs,
  resolveCbsReleaseTargets,
  type CbsReleaseTarget,
} from "../src/lib/cbs-release";

// vitest fails to collect some suites from a lower-case drive letter.
const root = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const TSX = join(root, "node_modules/tsx/dist/cli.mjs");
const VITEST = join(root, "node_modules/vitest/vitest.mjs");

const title = (s: string) => console.log(`\n=== ${s} ===`);

/** Run a node script, echoing its output. Returns the exit code. */
function run(args: string[], target?: CbsReleaseTarget, quiet = false): number {
  const res = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: quiet ? "ignore" : "inherit",
    env: {
      ...process.env,
      // Quiets pg's sslmode notice, which buries the plan.
      NODE_NO_WARNINGS: "1",
      ...(target && { DATABASE_URL: target.url }),
    },
  });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

function must(what: string, code: number) {
  if (code !== 0) throw new Error(`${what} failed. Stopping here.`);
}

const script = (name: string, ...args: string[]) => [
  TSX,
  `scripts/${name}.ts`,
  ...args,
];

function plan(t: CbsReleaseTarget, legacy: boolean) {
  title(`Plan for ${t.name}: ${t.host}`);
  must("The import plan", run(script("import-cbs", "--dry-run"), t));
  must(
    "The piping plan",
    run(script("sync-piping-group-codes", "--dry-run"), t),
  );
  if (legacy) {
    must("The legacy plan", run(script("import-cbs-legacy", "--dry-run"), t));
  }
}

async function ask(t: CbsReleaseTarget): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(`No terminal to ask in. Pass --yes=${t.name} to write.`);
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\nWrite this to ${t.name} (${t.host})? Type "${t.name}" to go ahead: `,
    );
    return cbsReleaseConsented(t.name, answer);
  } finally {
    rl.close();
  }
}

function write(t: CbsReleaseTarget, legacy: boolean) {
  title(`Writing to ${t.name}: ${t.host}`);
  const check = script("import-cbs", "--dry-run", "--expect-current");
  // An import that changes nothing would still be recorded as the last update.
  if (run(check, t, true) === 0) {
    console.log("The CBS is already current. Import skipped.");
  } else {
    must(`The import into ${t.name}`, run(script("import-cbs"), t));
  }
  must(
    `The piping sync on ${t.name}`,
    run(script("sync-piping-group-codes"), t),
  );
  if (legacy) {
    must(`The legacy import on ${t.name}`, run(script("import-cbs-legacy"), t));
  }
  title(`Checking ${t.name}`);
  must(
    `${t.name} does not match the workbook after the import: the check`,
    run(check, t),
  );
}

async function main() {
  const opts = parseCbsReleaseArgs(process.argv.slice(2));
  let env: Record<string, string>;
  try {
    env = parse(readFileSync(join(root, ".env.cbs")));
  } catch {
    throw new Error(
      "No .env.cbs. Create it with CBS_DB_LOCAL and CBS_DB_STAGE.",
    );
  }
  const targets = resolveCbsReleaseTargets(opts.targets, env);
  for (const t of targets) console.log(`${t.name}: ${t.host}`);

  if (!opts.skipExpand) {
    title("Expanding the master");
    must("The expand", run(script("expand-cbs-workbook")));
  }
  title("Drift guards");
  must(
    "A drift guard",
    run([
      VITEST,
      "run",
      "src/config/disciplines-cbs.test.ts",
      "src/lib/summary-rows-cbs.test.ts",
    ]),
  );

  // Every plan before any write, so a problem on one shows before the other
  // has been touched.
  for (const t of targets) plan(t, opts.legacy);
  if (opts.dryRun) {
    console.log("\n--dry-run: no database was written.");
    return;
  }

  const done: string[] = [];
  for (const t of targets) {
    if (opts.yes.includes(t.name) || (await ask(t))) {
      write(t, opts.legacy);
      done.push(t.name);
    } else console.log(`Skipped ${t.name}.`);
  }
  title("Done");
  console.log(
    `Released to: ${done.join(", ") || "nothing"}. ` +
      "Commit CBS.master.xlsx and CBS.xlsx.",
  );
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});

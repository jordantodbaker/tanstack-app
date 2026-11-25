/**
 * `cbs:release`'s decisions, apart from the running of them: what the command
 * line asks for, which databases that means, and what counts as consent to
 * write. Pure, so the part that protects stage is tested. The orchestration
 * is `scripts/cbs-release.ts`.
 */

export const CBS_RELEASE_TARGETS = ["local", "stage"] as const;
export type CbsReleaseTargetName = (typeof CBS_RELEASE_TARGETS)[number];

/** The `.env.cbs` variable holding each target's connection string. */
export const CBS_RELEASE_ENV: Record<CbsReleaseTargetName, string> = {
  local: "CBS_DB_LOCAL",
  stage: "CBS_DB_STAGE",
};

export type CbsReleaseOptions = {
  targets: CbsReleaseTargetName[];
  /** Plan only. */
  dryRun: boolean;
  /** Also reload the legacy codes. */
  legacy: boolean;
  /** Use the CBS.xlsx on disk rather than regenerating it. */
  skipExpand: boolean;
  /** Targets consented to up front, for a run with no one to ask. */
  yes: CbsReleaseTargetName[];
};

function targetList(flag: string, value: string | undefined) {
  const names = (value ?? "").split(",").filter(Boolean);
  if (names.length === 0) throw new Error(`${flag} needs a target name.`);
  for (const n of names) {
    if (!(CBS_RELEASE_TARGETS as readonly string[]).includes(n)) {
      throw new Error(
        `${flag}: unknown target "${n}". Use ${CBS_RELEASE_TARGETS.join(" or ")}.`,
      );
    }
  }
  return CBS_RELEASE_TARGETS.filter((t) => names.includes(t));
}

/** Throws on anything unrecognized: a typo must not fall back to a write. */
export function parseCbsReleaseArgs(
  args: readonly string[],
): CbsReleaseOptions {
  const out: CbsReleaseOptions = {
    targets: [...CBS_RELEASE_TARGETS],
    dryRun: false,
    legacy: false,
    skipExpand: false,
    yes: [],
  };
  for (const arg of args) {
    const [flag, value] = arg.split("=", 2);
    if (flag === "--target") out.targets = targetList(flag, value);
    else if (flag === "--yes") out.yes = targetList(flag, value);
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--legacy") out.legacy = true;
    else if (arg === "--skip-expand") out.skipExpand = true;
    else throw new Error(`Unknown option "${arg}".`);
  }
  return out;
}

export type CbsReleaseTarget = {
  name: CbsReleaseTargetName;
  url: string;
  host: string;
};

/**
 * The databases to run against. Refuses two names for one host: a pasted
 * wrong line would otherwise "release to both" while leaving one behind.
 */
export function resolveCbsReleaseTargets(
  names: readonly CbsReleaseTargetName[],
  env: Readonly<Record<string, string | undefined>>,
): CbsReleaseTarget[] {
  const targets = names.map((name) => {
    const url = env[CBS_RELEASE_ENV[name]]?.trim();
    if (!url) {
      throw new Error(`${CBS_RELEASE_ENV[name]} is not set in .env.cbs.`);
    }
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      // Not the URL itself: it holds a password.
      throw new Error(`${CBS_RELEASE_ENV[name]} is not a connection string.`);
    }
    return { name, url, host };
  });
  for (const t of targets) {
    const twin = targets.find((o) => o !== t && o.host === t.host);
    if (twin) {
      throw new Error(
        `${t.name} and ${twin.name} are the same database (${t.host}).`,
      );
    }
  }
  return targets;
}

/** Typing the target's own name is the only yes. */
export function cbsReleaseConsented(
  target: CbsReleaseTargetName,
  answer: string,
): boolean {
  return answer.trim().toLowerCase() === target;
}

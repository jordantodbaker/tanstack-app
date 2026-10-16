/**
 * The corrections CBS.xlsx needs each time a fresh copy arrives from upstream.
 *
 * Twice now the same two defects have come back in a new copy of the workbook,
 * and both are invisible until an import is run: the loader rejects the
 * malformed rows, the import reads that as "these accounts were deleted", and
 * it takes every project's grants for them along with it.
 *
 * Pure on purpose — the script around it does the Excel and the zip, this
 * decides what should change, so the refusal rules can be tested without a
 * workbook. Same split as `cbs-rename-plan`.
 */

/** One row as read from the sheet. */
export type RepairRow = {
  /** 1-based sheet row, for addressing the cell. */
  row: number;
  displayCode: string;
  name: string;
  /** The sheet's L7 column — the cost type, which must track the code. */
  l7: string;
};

export type RepairReason = "doubled-cost-type" | "division-renumber";

export type RepairFix = {
  row: number;
  was: string;
  displayCode: string;
  /** Set only when the L7 column disagrees with the corrected code. */
  l7?: string;
  reason: RepairReason;
  note: string;
};

export type RepairPlan = {
  fixes: RepairFix[];
  /** Why the plan is unsafe. Non-empty means write nothing. */
  problems: string[];
  /**
   * Corrections that did not apply, and why. Reported but harmless: a repaired
   * workbook reaches here every time, because once Specialty Services has
   * moved to 950 the "950 -> 960" correction finds a row it was not written
   * for and leaves it alone. Treating that as a failure would make the script
   * unsafe to re-run, which is the one thing it has to be.
   */
  skipped: string[];
};

/**
 * Divisions the upstream workbook numbers the old way.
 *
 * `expectName` is a guard, not decoration: it refuses to renumber a row that
 * is not the one this correction was written for, which is the difference
 * between repairing a workbook and corrupting one.
 */
export const DIVISION_RENUMBERS: {
  from: string;
  to: string;
  expectName: RegExp;
}[] = [
  {
    from: "920-00-0000-00-0",
    to: "950-00-0000-00-0",
    expectName: /specialty services/i,
  },
  {
    from: "950-00-0000-00-0",
    to: "960-00-0000-00-0",
    expectName: /startup\s*&?\s*commissioning/i,
  },
];

const VALID = /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}-[0-9A-Z]$/;
/** A code carrying its cost type twice, e.g. "022-00-0000-00-0-S". */
const DOUBLED =
  /^([0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2})-([0-9A-Z])-([0-9A-Z])$/;
/** "(S)" / "(M)" on a generated twin, "(*)" on the account's own row. */
const NAME_SUFFIX = /\((\*|[A-Z])\)\s*$/;

/** The cost code is the display code without its dashes. */
export const costCodeFor = (displayCode: string) =>
  displayCode.replace(/-/g, "");

export function planCbsWorkbookRepair(
  rows: RepairRow[],
  renumbers = DIVISION_RENUMBERS,
): RepairPlan {
  const fixes: RepairFix[] = [];
  const problems: string[] = [];
  const skipped: string[] = [];
  /** Codes on rows this plan leaves alone — a correction must not land on one. */
  const untouched = new Set<string>();
  const moving = new Set<string>();

  for (const r of rows) {
    const code = r.displayCode.trim();
    if (!code) continue;

    const doubled = DOUBLED.exec(code);
    if (doubled) {
      const [, base, first, second] = doubled;
      // Keep the cost type and drop the duplicated "0" backbone segment.
      //
      // The sheet's own L7 column is NOT the authority here: it still reads
      // "0" on the "-0-S" and "-0-M" rows, and trusting it collapsed each of
      // those accounts' 0 / S / M rows onto one code.
      const keep = first !== "0" ? first : second;
      const fixed = `${base}-${keep}`;

      // The name suffix is an independent witness, so a silent disagreement
      // becomes a refusal rather than a wrong code.
      const suffix = NAME_SUFFIX.exec(r.name.trim())?.[1];
      if (suffix && suffix !== "*" && suffix !== keep) {
        problems.push(
          `row ${r.row}: name says "(${suffix})" but the code implies "${keep}" — ${code}`,
        );
      }
      fixes.push({
        row: r.row,
        was: code,
        displayCode: fixed,
        l7: r.l7.trim().toUpperCase() === keep ? undefined : keep,
        reason: "doubled-cost-type",
        note: `cost type written twice; keeping "${keep}"`,
      });
      moving.add(fixed);
      continue;
    }

    const renumber = renumbers.find((d) => d.from === code);
    if (renumber) {
      if (!renumber.expectName.test(r.name)) {
        skipped.push(
          `${code} -> ${renumber.to} not applied: row ${r.row} is "${r.name.trim()}", not the row this correction was written for`,
        );
        untouched.add(code);
        continue;
      }
      fixes.push({
        row: r.row,
        was: code,
        displayCode: renumber.to,
        reason: "division-renumber",
        note: `${r.name.trim()} belongs at ${renumber.to.slice(0, 3)}`,
      });
      moving.add(renumber.to);
      continue;
    }

    untouched.add(code);
  }

  // A correction must produce a valid code, must not duplicate another
  // correction, and must not collide with a row left alone.
  const seen = new Map<string, number>();
  for (const f of fixes) {
    if (!VALID.test(f.displayCode)) {
      problems.push(`row ${f.row}: ${f.was} would become "${f.displayCode}", which is not a display code`);
    }
    const clash = seen.get(f.displayCode);
    if (clash !== undefined) {
      problems.push(`rows ${clash} and ${f.row} would both become ${f.displayCode}`);
    } else {
      seen.set(f.displayCode, f.row);
    }
    if (untouched.has(f.displayCode)) {
      problems.push(`row ${f.row}: ${f.displayCode} already belongs to a row this plan leaves alone`);
    }
  }

  return { fixes, problems, skipped };
}

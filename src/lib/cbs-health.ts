/**
 * CBS health checks — the defects the catalog can carry, as data.
 *
 * Every one of these has bitten in practice, and every one was found by
 * running a script and reading its output. The import prints most of them once
 * and then forgets; the database keeps no record at all. Worst of the lot is
 * the duplicate display code, which is dropped at import, so the account
 * simply does not exist in the app and nothing anywhere says so.
 *
 * Shapes only. The server gathers the evidence (see `cbs-health.server`),
 * which keeps the severities and the wording testable without a database or a
 * workbook.
 */

export type HealthSeverity = "error" | "warning" | "info";

/**
 * One affected row. Three fields rather than a sentence, so the page can list
 * them as a table and the export can give them columns — a reader fixing 236
 * of these in Excel wants to sort by code, not read prose.
 */
export type HealthFinding = {
  /** The display code, or the offending value where the check is not per-row. */
  code: string;
  name: string;
  /** What is wrong with this one, and what it should be. */
  detail: string;
  /**
   * The Original Row in the workbook, so a reader can go straight to the
   * cell. Absent where the finding is not a catalog row — a Core value that
   * resolves to nothing, or a workbook row the loader rejected before it
   * could carry a row number; those say "workbook row N" in `detail` instead.
   */
  originalRow?: number | null;
};

export type HealthCheck = {
  id: string;
  title: string;
  severity: HealthSeverity;
  /** How many rows/values are affected. 0 means the check passed. */
  count: number;
  /** What the number means. */
  summary: string;
  /** What to do about it. Empty when the check passed. */
  action: string;
  /**
   * Every affected row, not a sample: the page lists a few and expands to the
   * rest, and the Excel export writes the lot. Capped at `FINDING_LIMIT` so a
   * pathological workbook cannot produce an unbounded payload; `count` is
   * always the true total.
   */
  findings: HealthFinding[];
};

/**
 * Most findings a single check will carry back. Nothing reaches it today —
 * the largest is around 5,500 — and `count` still reports the truth, so a
 * clipped list only means the tail is export-only.
 */
export const FINDING_LIMIT = 10_000;

export type HealthReport = {
  checks: HealthCheck[];
  /** Rows in the workbook, or null when the workbook is not on this server. */
  workbookRows: number | null;
  databaseRows: number;
  generatedAt: string;
};

/**
 * Builds a check, choosing the "all clear" wording when nothing was found.
 *
 * Every check goes through here so that its id and title are written once. The
 * obvious alternative — a ternary between `passing(...)` and an object literal
 * — spells both out twice per check, which is two chances per check for them
 * to drift apart.
 *
 * An options object rather than eight positional arguments: four of them are
 * adjacent strings, so transposing `summary` and `action` would typecheck
 * and quietly show the remedy where the explanation belongs.
 *
 * `count` is taken separately from `findings.length` because a check may count
 * rows while listing something coarser, and because the list is capped while
 * the count must stay true.
 */
export type CheckInput = {
  id: string;
  title: string;
  severity: HealthSeverity;
  findings: HealthFinding[];
  /** How many rows/values are affected; 0 selects the "all clear" wording. */
  count: number;
  /** What the number means. */
  summary: string;
  /** What to do about it. */
  action: string;
  /** What to say when the check passes. */
  clear: string;
};

export function check({
  id,
  title,
  severity,
  findings,
  count,
  summary,
  action,
  clear,
}: CheckInput): HealthCheck {
  if (count === 0) return passing(id, title, clear);
  return {
    id,
    title,
    severity,
    count,
    summary,
    action,
    // Spreadsheet order, because that is how the list gets worked. Findings
    // with no row — a Core value that resolves to nothing — sort to the end
    // rather than to the top. Sorted BEFORE the cap, so a clipped list keeps
    // the earliest rows rather than an arbitrary slice.
    findings: [...findings]
      .sort(
        (a, b) =>
          (a.originalRow ?? Number.POSITIVE_INFINITY) -
            (b.originalRow ?? Number.POSITIVE_INFINITY) ||
          a.code.localeCompare(b.code),
      )
      .slice(0, FINDING_LIMIT),
  };
}

/** A check with nothing wrong, so the page can say so rather than stay silent. */
export function passing(
  id: string,
  title: string,
  summary: string,
): HealthCheck {
  return {
    id,
    title,
    severity: "info",
    count: 0,
    summary,
    action: "",
    findings: [],
  };
}

/** Worst first, then biggest; a clean check sorts to the bottom. */
export function sortChecks(checks: HealthCheck[]): HealthCheck[] {
  const rank: Record<HealthSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return [...checks].sort(
    (a, b) =>
      Number(a.count === 0) - Number(b.count === 0) ||
      rank[a.severity] - rank[b.severity] ||
      b.count - a.count ||
      a.title.localeCompare(b.title),
  );
}

/** One line for the page header. */
export function healthHeadline(checks: HealthCheck[]): string {
  const failing = checks.filter((c) => c.count > 0);
  if (failing.length === 0) return "No problems found in the CBS catalog.";
  const errors = failing.filter((c) => c.severity === "error").length;
  const warnings = failing.filter((c) => c.severity === "warning").length;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} needing attention`);
  if (warnings) parts.push(`${warnings} worth a look`);
  const rest = failing.length - errors - warnings;
  if (rest) parts.push(`${rest} for information`);
  return `${failing.length} of ${checks.length} checks found something — ${parts.join(", ")}.`;
}

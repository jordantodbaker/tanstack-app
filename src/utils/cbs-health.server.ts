import { prisma } from "../server/db";
import {
  loadCbsWorkbookCached,
  type CbsWorkbookLoad,
  type CbsWorkbookReport,
} from "../../prisma/cbs-workbook";
import { buildCoreLinks } from "~/lib/cbs-core-links";
import { runCbsQcChecks } from "~/lib/cbs-qc";
import { cbsIsActive } from "~/lib/cbs-tree";
import {
  check,
  healthHeadline,
  passing,
  sortChecks,
  type CheckInput,
  type HealthCheck,
  type HealthReport,
} from "~/lib/cbs-health";

/**
 * SERVER-ONLY. Gathers the evidence behind the CBS Health page: the workbook
 * on disk and the catalog in the database, compared against each other.
 *
 * Each check answers one question a person would otherwise have to run a
 * script to ask, and says what to do about the answer. A check that passes is
 * still returned, so the page can show that it was asked.
 */
/**
 * The last report, kept briefly so the page and a per-check export built from
 * it do not each pay the rebuild twice over. Per server instance, which is all
 * a cache needs to be.
 *
 * Measured at ~1.6s against the hosted database — almost all of it the two
 * reads of ~12,000 rows, since the checks themselves are in-memory passes.
 * It was ~30s before the quadratic workbook/database comparison was fixed.
 */
let cached: { at: number; report: HealthReport } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function getCbsHealthReport(): Promise<HealthReport> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;
  const report = await buildCbsHealthReport();
  cached = { at: Date.now(), report };
  return report;
}

/**
 * What a workbook check contributes once the sheet is in hand: everything
 * except the id and title, which `workbookCheck` holds because it needs them
 * in the case where there is no sheet to build from.
 */
type WorkbookCheckBody = Omit<CheckInput, "id" | "title">;

export async function buildCbsHealthReport(): Promise<HealthReport> {
  // Cached on the file's mtime and size: parsing it is ~2.5s and the only
  // thing that changes it is someone saving CBS.xlsx.
  //
  // Optional, because CBS.xlsx is a working file on somebody's machine, not
  // part of the deployment. A built server has no copy of it, so the four
  // checks that compare the sheet against the database simply cannot be asked
  // there — and a page that died rather than saying so took the other
  // eighteen down with it.
  let workbookLoad: CbsWorkbookLoad | null = null;
  let workbookProblem = "";
  try {
    workbookLoad = await loadCbsWorkbookCached();
  } catch (err) {
    workbookProblem =
      (err as NodeJS.ErrnoException)?.code === "ENOENT"
        ? "CBS.xlsx is not on this server — these checks only run where the workbook lives."
        : `CBS.xlsx could not be read here: ${err instanceof Error ? err.message : String(err)}`;
  }
  const workbook = workbookLoad?.items ?? [];
  const report = workbookLoad?.report;

  /**
   * A workbook check, or a note saying why it could not be asked.
   *
   * Holds the id and title rather than reading them off the built check: with
   * no sheet there is nothing to build, and the check still has to appear on
   * the page under its own name. So the builder supplies everything else and
   * these two are written once per check instead of twice.
   */
  const workbookCheck = (
    id: string,
    title: string,
    build: (sheet: CbsWorkbookReport) => WorkbookCheckBody,
  ): HealthCheck =>
    report
      ? check({ id, title, ...build(report) })
      : // Nothing found and nothing to do: the same shape as a clean check,
        // with `summary` saying why rather than claiming all clear.
        passing(id, title, workbookProblem);
  // Deliberately without `allowedInProjects`: including it turns this into a
  // join over every one of ~12,000 rows when only a handful of them — the
  // retired ones and the ones an import would delete — ever need it. Those are
  // fetched by code further down, once it is known which they are.
  const rows = await prisma.cbsItem.findMany({
    // Wide enough for the QC rules, which read most of the workbook's
    // columns. Still one pass over the table.
    select: {
      id: true,
      displayCode: true,
      costCode: true,
      name: true,
      core: true,
      status: true,
      uom: true,
      description: true,
      accountDescription: true,
      l2Description: true,
      costCenter: true,
      costClassification: true,
      gl: true,
      discipline: true,
      materialType: true,
      materialCode: true,
      subReporting: true,
      originalRow: true,
    },
    // No `orderBy`. The one check that cares about workbook order — the QC
    // sort-order rule — sorts by id itself, so ordering here only made the
    // database sort 11,832 rows for JavaScript to sort them again.
  });

  /** Which projects hold each of these codes. One query, only for codes that need it. */
  async function grantsFor(displayCodes: string[]) {
    if (displayCodes.length === 0) return new Map<string, string[]>();
    const granted = await prisma.cbsItem.findMany({
      where: { displayCode: { in: displayCodes } },
      select: {
        displayCode: true,
        allowedInProjects: { select: { displayId: true } },
      },
    });
    return new Map(
      granted.map((g) => [
        g.displayCode,
        g.allowedInProjects.map((p) => p.displayId),
      ]),
    );
  }

  const checks: HealthCheck[] = [];

  // 1. Duplicate display codes. The import keeps one row and drops the rest,
  //    so the dropped account exists in the workbook and nowhere else.
  checks.push(
    workbookCheck("duplicates", "Duplicate display codes", (sheet) => {
      const dropped = sheet.duplicates.filter((d) => !d.kept);
      return {
        severity: "error",
        findings: dropped.map((d) => ({
          code: d.displayCode,
          name: d.name,
          detail: `workbook row ${d.row} — dropped, an earlier row already claims this code`,
        })),
        count: dropped.length,
        summary:
          "Two or more workbook rows claim the same display code. The import keeps the first and silently drops the rest, so those accounts exist in the workbook and nowhere in this app.",
        action:
          "Give each account its own code in CBS.xlsx, then re-import. Until then the dropped names cannot be estimated against.",
        clear: "Every workbook row has a display code of its own.",
      };
    }),
  );

  // 2. Display codes the loader cannot parse — those rows never load at all.
  checks.push(
    workbookCheck("invalid", "Unreadable display codes", (sheet) => ({
      severity: "error",
      findings: sheet.invalid.map((i) => ({
        code: i.displayCode,
        name: i.name,
        detail: `workbook row ${i.row} — ${i.reason}`,
      })),
      count: sheet.invalid.length,
      summary:
        "These rows are in the workbook but their display code is not XXX-XX-XXXX-XX-X, so the import rejects them outright.",
      action:
        "Fix the Display Code cells in CBS.xlsx and re-import. A doubled cost-type segment is the usual cause.",
      clear: "Every workbook row has a display code the import can read.",
    })),
  );

  // 3. Helper columns disagreeing with the code: a half-finished renumber.
  checks.push(
    workbookCheck("segments", "Renumbers left half-done", (sheet) => ({
      severity: "warning",
      findings: sheet.segmentMismatches.map((s) => ({
        code: s.codeL1,
        name: s.sample.name,
        detail: `${s.rows} row(s) say ${s.columnsL1} but are coded ${s.codeL1} — e.g. workbook row ${s.sample.row}`,
      })),
      count: sheet.segmentMismatches.reduce((n, s) => n + s.rows, 0),
      summary:
        "The L1-L6 helper columns put these rows in a different division from their display code. The display code is the account's identity, so editing only the helper columns moves nothing.",
      action: "Decide which is right and make the other match, then re-import.",
      clear: "Every row's L1-L6 columns agree with its display code.",
    })),
  );

  // 4. Core codes pointing at an account that does not exist.
  const core = buildCoreLinks(rows);
  const dangling = core.problems.filter((p) => p.reason === "missing");
  const danglingRows = dangling.reduce((n, p) => n + p.count, 0);
  checks.push(
    check({
      id: "core-dangling",
      title: "Core codes pointing nowhere",
      severity: "warning",
      findings: dangling.map((p) => ({
        code: p.raw,
        name: "",
        detail: `${p.count} row(s) point here, e.g. ${p.sample.join(", ")} — no such account`,
      })),
      count: danglingRows,
      summary:
        "These rows carry a Core code naming an account that is not in the catalog, so they are missing from the Core Code Roll-up and from any total built on it.",
      action:
        "Usually the target account was removed by a workbook change. Re-point the Core cells, or restore the account.",
      clear: "Every Core code resolves to an account in the catalog.",
    }),
  );

  // 5. Core codes that match two accounts: the leading zero Excel ate.
  const ambiguous = core.problems.filter((p) => p.reason === "ambiguous");
  checks.push(
    check({
      id: "core-ambiguous",
      title: "Ambiguous Core codes",
      severity: "warning",
      findings: ambiguous.map((p) => ({
        code: p.raw,
        name: "",
        detail: `${p.count} row(s), matches ${p.candidates.join(" and ")}`,
      })),
      count: ambiguous.reduce((n, p) => n + p.count, 0),
      summary:
        "Excel stores the Core column as a number, so a leading zero is lost. These values match two real accounts and are left unlinked rather than guessed.",
      action:
        "Format the Core column as text in CBS.xlsx and restore the leading zeros.",
      clear: "No Core code matches more than one account.",
    }),
  );

  // 6. Priced rows with no "-0" account row above them. They vanish from any
  //    view that lists one row per account.
  const have = new Set(rows.map((r) => r.displayCode));
  const orphans = rows.filter(
    (r) =>
      !r.displayCode.endsWith("-0") &&
      !have.has(r.displayCode.replace(/-[^-]+$/, "-0")),
  );
  checks.push(
    check({
      id: "no-backbone",
      title: "Priced rows with no account row",
      severity: "info",
      findings: orphans.map((o) => ({
        code: o.displayCode,
        name: o.name,
        detail: `no ${o.displayCode.replace(/-[^-]+$/, "-0")} account row`,
        originalRow: o.originalRow,
      })),
      count: orphans.length,
      summary:
        'These rows carry a cost type but the account they belong to has no "-0" row, so they are absent from the Cost Accounts list, which shows one row per account.',
      action:
        "Expected for deliverable-style codes. Add the account row in CBS.xlsx if any of them should be pickable from the Cost Accounts list.",
      clear: 'Every priced row has its "-0" account row.',
    }),
  );

  // 7. Retired codes a project still holds. Invisible on both Setup and the
  //    Project Cost Code List, so the grant cannot be revoked from the UI.
  const retired = rows.filter((r) => !cbsIsActive(r.status));
  const retiredGrants = await grantsFor(retired.map((r) => r.displayCode));
  const retainedRetired = retired.filter(
    (r) => (retiredGrants.get(r.displayCode) ?? []).length > 0,
  );
  checks.push(
    check({
      id: "retired-granted",
      title: "Retired codes still granted",
      severity: "info",
      findings: retainedRetired.map((r) => ({
        code: r.displayCode,
        name: r.name,
        detail: `${r.status}, still granted to ${(retiredGrants.get(r.displayCode) ?? []).join(", ")}`,
        originalRow: r.originalRow,
      })),
      count: retainedRetired.length,
      summary:
        "These codes are not Active but a project still holds them. Setup and the Project Cost Code List both hide retired codes, so the grant cannot be seen or revoked from the UI.",
      action:
        "Harmless — nothing can book against a code it cannot see. Clear the grants if you want the allow-list counts to be honest.",
      clear: "No project holds a retired code.",
    }),
  );

  // 8. Workbook against database: what the next import would change.
  //
  // Guarded, not just wrapped: without the sheet, `workbook` is empty and the
  // arithmetic below would report every row in the catalog as about to be
  // deleted — a false alarm far worse than saying nothing.
  const wanted = new Set(workbook.map((w) => w.displayCode.replace(/-/g, "")));
  const stale = report ? rows.filter((r) => !wanted.has(r.costCode)) : [];
  // Both sides are set lookups. The obvious `workbook.filter(w =>
  // !rows.some(...))` is quadratic — ~140 million comparisons at this size,
  // and on its own it took this report from under four seconds to thirty.
  const held = new Set(rows.map((r) => r.costCode));
  const fresh = workbook.filter(
    (w) => !held.has(w.displayCode.replace(/-/g, "")),
  );
  const staleGrants = await grantsFor(stale.map((s) => s.displayCode));
  const drift = stale.length + fresh.length;
  checks.push(
    // The title is neutral rather than "…in step" / "…out of step". One check
    // has one name: it is the export's filename and the row you look for on
    // the page, and neither should change with the outcome.
    workbookCheck("import-drift", "Workbook against the database", () => ({
      severity: "warning",
      findings: [
        ...fresh.map((f) => ({
          code: f.displayCode,
          name: f.name,
          detail: "in CBS.xlsx only — an import would add it",
          originalRow: f.originalRow,
        })),
        ...stale.map((s) => ({
          code: s.displayCode,
          name: s.name,
          originalRow: s.originalRow,
          detail: `in the database only — an import would DELETE it${
            (staleGrants.get(s.displayCode) ?? []).length
              ? `, and it is granted to ${(staleGrants.get(s.displayCode) ?? []).join(", ")}`
              : ""
          }`,
        })),
      ],
      count: drift,
      summary: `CBS.xlsx holds ${fresh.length} code(s) this database does not, and the database holds ${stale.length} the workbook no longer has. An import would create the first set and DELETE the second, taking their project grants with them.`,
      action:
        "Run `npm run cbs:import -- --dry-run` to see the full plan before importing.",
      clear:
        "The catalog matches CBS.xlsx; an import would add and remove nothing.",
    })),
  );

  // The deterministic rules from the CBS QC pass, over the same rows.
  checks.push(...runCbsQcChecks(rows));

  return {
    checks: sortChecks(checks),
    // Null rather than zero when the sheet is not on this server: "no rows"
    // and "no workbook" are different things and the header says so.
    workbookRows: report ? workbook.length : null,
    databaseRows: rows.length,
    generatedAt: new Date().toISOString(),
  };
}

/** Re-exported so the route can show the headline without a second import. */
export { healthHeadline };

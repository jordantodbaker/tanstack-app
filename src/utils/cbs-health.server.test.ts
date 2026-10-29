import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthCheck } from "~/lib/cbs-health";

/**
 * The CBS Health report when CBS.xlsx is not on the server.
 *
 * This is the case that broke in production: the workbook is a working file on
 * somebody's machine, not part of the deployment, so on Vercel the four checks
 * that compare the sheet against the database cannot be asked. The page died
 * rather than saying so, taking the other eighteen checks down with it. The
 * assertion that matters here is not the wording of the four — it is that
 * everything else still runs.
 *
 * Prisma and the workbook loader are replaced with in-memory fakes: the real
 * `../server/db` pulls in the reminder cron, and the point of the test is the
 * branch where the loader throws.
 */

const { cbsItemFindMany, loadWorkbook } = vi.hoisted(() => ({
  cbsItemFindMany: vi.fn(),
  loadWorkbook: vi.fn(),
}));

vi.mock("../server/db", () => ({
  prisma: { cbsItem: { findMany: cbsItemFindMany } },
}));
vi.mock("../../prisma/cbs-workbook", () => ({
  loadCbsWorkbookCached: loadWorkbook,
}));

import { buildCbsHealthReport } from "./cbs-health.server";

/** The four checks that need the sheet; everything else is database-only. */
const WORKBOOK_CHECKS = ["duplicates", "invalid", "segments", "import-drift"];

let nextId = 1;
/** A row that trips nothing, so a case only has to break one thing. */
function row(displayCode: string, over: Record<string, unknown> = {}) {
  return {
    id: nextId++,
    displayCode,
    costCode: displayCode.replace(/-/g, ""),
    name: `Account ${displayCode}`,
    core: null,
    status: "Active",
    uom: "LS",
    description: "Cost for the account",
    accountDescription: "Account description",
    l2Description: "L2 description",
    costCenter: "1234",
    costClassification: "DIRECT",
    gl: "5000",
    discipline: "Piping",
    materialType: null,
    materialCode: null,
    subReporting: null,
    originalRow: 100,
    ...over,
  };
}

// One roll-up row carrying a cost type (trips a QC rule, and has no "-0"
// account row above it), and one retired row a project still holds.
const ROWS = [
  row("600-00-0000-00-L"),
  row("601-00-0000-00-0", { status: "Retired" }),
];

beforeEach(() => {
  nextId = 1;
  cbsItemFindMany.mockReset();
  cbsItemFindMany.mockImplementation(
    async (args: { select?: Record<string, unknown> }) =>
      // `grantsFor` asks a second time, for the allow-list of named codes only.
      args.select?.allowedInProjects
        ? [
            {
              displayCode: "601-00-0000-00-0",
              allowedInProjects: [{ displayId: "1901" }],
            },
          ]
        : ROWS,
  );
  loadWorkbook.mockReset();
  loadWorkbook.mockRejectedValue(
    Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
  );
});

const byId = (checks: HealthCheck[], id: string) =>
  checks.find((c) => c.id === id)!;

describe("buildCbsHealthReport without CBS.xlsx", () => {
  it("builds a report rather than throwing", async () => {
    // The original failure: the whole page returned "Failed to run the CBS
    // health checks" because one unavailable input killed the request.
    const report = await buildCbsHealthReport();
    expect(report.checks.length).toBeGreaterThan(15);
    expect(report.databaseRows).toBe(ROWS.length);
  });

  it("reports no workbook row count rather than zero", async () => {
    // Zero would read as "the workbook is empty", which is a different and
    // much more alarming claim than "the workbook is not here".
    expect((await buildCbsHealthReport()).workbookRows).toBeNull();
  });

  it("says why each workbook check could not be asked", async () => {
    const { checks } = await buildCbsHealthReport();
    for (const id of WORKBOOK_CHECKS) {
      const c = byId(checks, id);
      expect(c, id).toMatchObject({
        severity: "info",
        count: 0,
        findings: [],
        action: "",
      });
      // Named, so the row still appears on the page under its own title.
      expect(c.title, id).not.toBe("");
      expect(c.summary, id).toContain("not on this server");
    }
  });

  it("still runs every check that only needs the database", async () => {
    // The point of the fix. A QC rule and a grant-dependent check both have to
    // produce their real answers with no sheet in hand.
    const { checks } = await buildCbsHealthReport();
    expect(byId(checks, "qc-l3-cost-type")).toMatchObject({
      count: 1,
      severity: "error",
    });
    expect(byId(checks, "retired-granted").count).toBe(1);
    expect(byId(checks, "retired-granted").findings[0].detail).toContain(
      "1901",
    );
  });

  it("blames only the four checks that need the sheet", async () => {
    // Guards against the opposite regression: a database-only check wrapped as
    // workbook-dependent would go quiet here and nobody would notice.
    const { checks } = await buildCbsHealthReport();
    const silenced = checks
      .filter((c) => c.summary.includes("not on this server"))
      .map((c) => c.id)
      .sort();
    expect(silenced).toEqual([...WORKBOOK_CHECKS].sort());
  });

  it("distinguishes an unreadable workbook from an absent one", async () => {
    // A corrupt or locked file is somebody's problem to fix; a missing one on a
    // deployed server is expected. They must not read the same.
    loadWorkbook.mockRejectedValue(new Error("file is locked by Excel"));
    const summary = byId(
      (await buildCbsHealthReport()).checks,
      "duplicates",
    ).summary;
    expect(summary).toContain("could not be read here");
    expect(summary).toContain("locked by Excel");
    expect(summary).not.toContain("not on this server");
  });
});

/**
 * The check that stands in front of a destructive import.
 *
 * `import-drift` is what tells you an import is about to DELETE accounts and
 * take their project grants with them. It is the most intricate logic in the
 * report — two set differences across the workbook and the database, plus a
 * grant lookup for the doomed rows — and it already carried one real bug: the
 * quadratic scan that took the report from four seconds to thirty.
 */

/** A workbook row, matching what the loader hands back. */
function sheetRow(displayCode: string, over: Record<string, unknown> = {}) {
  return {
    displayCode,
    costCode: displayCode.replace(/-/g, ""),
    name: `Account ${displayCode}`,
    originalRow: 10,
    ...over,
  };
}

/** A clean report: nothing wrong with the sheet itself. */
const CLEAN_REPORT = {
  source: "CBS.xlsx",
  sheet: "CBS",
  sheetRows: 0,
  originals: 0,
  costCodeMismatches: 0,
  segmentMismatches: [],
  duplicates: [],
  invalid: [],
};

/** Hands the report a workbook holding exactly `codes`. */
const withWorkbook = (codes: string[], over: Record<string, unknown> = {}) =>
  loadWorkbook.mockResolvedValue({
    items: codes.map((c) => sheetRow(c)),
    report: {
      ...CLEAN_REPORT,
      sheetRows: codes.length,
      originals: codes.length,
      ...over,
    },
  });

describe("the import-drift check", () => {
  it("counts both sides of the difference, not just one", async () => {
    // The database has 600-…-L and 601-…-0; the workbook has 601-…-0 and a new
    // 602-…-0. So one row would be added and one deleted.
    withWorkbook(["601-00-0000-00-0", "602-00-0000-00-0"]);
    const c = byId((await buildCbsHealthReport()).checks, "import-drift");
    expect(c.count).toBe(2);
    expect(c.severity).toBe("warning");
  });

  it("says which rows an import would add", async () => {
    withWorkbook(["600-00-0000-00-L", "601-00-0000-00-0", "602-00-0000-00-0"]);
    const c = byId((await buildCbsHealthReport()).checks, "import-drift");
    const added = c.findings.filter((f) => f.detail.includes("would add"));
    expect(added.map((f) => f.code)).toEqual(["602-00-0000-00-0"]);
    expect(c.count).toBe(1);
  });

  it("shouts about a deletion, in capitals", async () => {
    // The asymmetry is deliberate: an add is routine, a delete loses data.
    withWorkbook(["600-00-0000-00-L"]);
    const c = byId((await buildCbsHealthReport()).checks, "import-drift");
    const doomed = c.findings.find((f) => f.code === "601-00-0000-00-0")!;
    expect(doomed.detail).toContain("would DELETE it");
  });

  it("names the projects that would lose a granted code", async () => {
    // The whole point of the check: a delete takes the project grants with it,
    // and the grant is invisible on Setup because the row is retired.
    withWorkbook(["600-00-0000-00-L"]);
    const c = byId((await buildCbsHealthReport()).checks, "import-drift");
    const doomed = c.findings.find((f) => f.code === "601-00-0000-00-0")!;
    expect(doomed.detail).toContain("granted to 1901");
  });

  it("does not claim a grant for a doomed row that has none", async () => {
    // 600-…-L is in the database and not the workbook, and no project holds it.
    withWorkbook(["601-00-0000-00-0"]);
    const c = byId((await buildCbsHealthReport()).checks, "import-drift");
    const doomed = c.findings.find((f) => f.code === "600-00-0000-00-L")!;
    expect(doomed.detail).toContain("would DELETE it");
    expect(doomed.detail).not.toContain("granted to");
  });

  it("reports all clear when the catalog matches the workbook", async () => {
    // Both database rows, nothing else: an import would change nothing.
    withWorkbook(["600-00-0000-00-L", "601-00-0000-00-0"]);
    const c = byId((await buildCbsHealthReport()).checks, "import-drift");
    expect(c).toMatchObject({ count: 0, severity: "info", findings: [] });
    expect(c.summary).toContain("would add and remove nothing");
  });

  it("keeps its title whichever way the comparison comes out", async () => {
    // The title is the export's filename and the row you look for on the page.
    withWorkbook(["600-00-0000-00-L", "601-00-0000-00-0"]);
    const clean = byId((await buildCbsHealthReport()).checks, "import-drift");
    withWorkbook(["602-00-0000-00-0"]);
    const dirty = byId((await buildCbsHealthReport()).checks, "import-drift");
    expect(clean.title).toBe(dirty.title);
    expect(clean.title).toBe("Workbook against the database");
  });

  it("matches on the code, not on the hyphens", async () => {
    // The database stores `costCode` without separators; the workbook carries
    // the display code. Comparing them raw would report every row twice over.
    withWorkbook(["600-00-0000-00-L", "601-00-0000-00-0"]);
    expect(
      byId((await buildCbsHealthReport()).checks, "import-drift").count,
    ).toBe(0);
  });

  it("reports the workbook's row count once the sheet is present", async () => {
    withWorkbook(["601-00-0000-00-0", "602-00-0000-00-0"]);
    expect((await buildCbsHealthReport()).workbookRows).toBe(2);
  });
});

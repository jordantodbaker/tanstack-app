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
    masterCbsRow: 100,
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

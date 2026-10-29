import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `cbs-rows.server` pulls in the real Prisma singleton (and, through
 * `../server/db`, the reminder cron). Replace it with a fake so these run in
 * the plain unit suite, and assert on the WHERE clauses it builds as well as
 * the rows it returns.
 */
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../server/db", () => ({ prisma: { cbsItem: { findMany } } }));

import { projectCostCodeRows } from "./cbs-rows.server";

let nextId = 1;
/** A row shaped like `cbsTreeRowSelect` returns it. */
const row = (
  displayCode: string,
  name: string,
  status: string | null = "Active",
) => ({
  id: nextId++,
  displayCode,
  name,
  uom: "LS",
  accountDescription: name,
  subReporting: null,
  materialCode: null,
  laborCode: null,
  equipmentCode: null,
  otherCode: null,
  status,
});

/** The display codes the second query asked for. */
const ancestorsRequested = (): string[] =>
  findMany.mock.calls[1]?.[0]?.where?.displayCode?.in ?? [];

beforeEach(() => {
  findMany.mockReset();
  nextId = 1;
});

describe("projectCostCodeRows", () => {
  it("drops a granted account that has been retired", async () => {
    findMany
      .mockResolvedValueOnce([
        row("052-15-0500-00-L", "Supers - General Field"),
        row("052-50-4000-00-0", "(Reserved) Authorized Inspector", "Inactive"),
      ])
      .mockResolvedValueOnce([]);

    const rows = await projectCostCodeRows(7);
    const names = rows.map((r) => r.name);
    expect(names).toContain("Supers - General Field");
    // Granted before it was retired, but it must not be offered as a code now.
    expect(names).not.toContain("(Reserved) Authorized Inspector");
  });

  it("keeps an account whose Status cell is blank", async () => {
    // ~190 live accounts have an empty Status. Treating blank as retired would
    // silently shrink every project's list.
    findMany
      .mockResolvedValueOnce([row("031-10-0000-00-0", "Civil Bulk", null)])
      .mockResolvedValueOnce([]);

    const rows = await projectCostCodeRows(7);
    expect(rows.map((r) => r.name)).toEqual(["Civil Bulk"]);
  });

  it("does not go looking for ancestors only a retired row needed", async () => {
    // The ancestor set is derived from the SURVIVING rows, so retiring a row
    // takes its unique parents out of the query rather than shipping summaries
    // with nothing under them.
    findMany
      .mockResolvedValueOnce([
        row("100-10-0000-00-0", "Site Prep"),
        row("052-50-4000-00-0", "(Reserved) Inspector", "Inactive"),
      ])
      .mockResolvedValueOnce([]);

    await projectCostCodeRows(7);
    const asked = ancestorsRequested();
    expect(asked.some((c) => c.startsWith("100-"))).toBe(true);
    expect(asked.some((c) => c.startsWith("052-"))).toBe(false);
  });

  it("still pulls in a retired ancestor, flagged as context", async () => {
    // Structure, not a code: `context` rows render muted, are left out of the
    // counts and cannot be picked. Dropping it would strand its live children
    // at the top level.
    findMany
      .mockResolvedValueOnce([row("112-10-0500-00-L", "Steel Erection")])
      .mockResolvedValueOnce([
        row("112-10-0000-00-0", "Steel (reserved)", "Inactive"),
      ]);

    const rows = await projectCostCodeRows(7);
    const parent = rows.find((r) => r.name === "Steel (reserved)");
    expect(parent).toBeDefined();
    expect(parent!.context).toBe(true);
    // The granted row is not context — it is a real grant.
    expect(
      rows.find((r) => r.name === "Steel Erection")!.context,
    ).toBeUndefined();
  });

  it("skips the second query when nothing is granted", async () => {
    findMany.mockResolvedValueOnce([]);
    expect(await projectCostCodeRows(7)).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("asks for every row this project was granted, generated ones included", async () => {
    // The list reads like the CBS Dictionary: each cost line on its own row,
    // so a granted S / M twin is a code the project may use.
    findMany.mockResolvedValueOnce([]);
    await projectCostCodeRows(42);
    expect(findMany.mock.calls[0][0].where).toEqual({
      allowedInProjects: { some: { id: 42 } },
    });
  });

  it("keeps a granted generated row and looks up ancestors of any row type", async () => {
    findMany
      .mockResolvedValueOnce([
        row("100-10-0000-00-S", "Site Prep Subcontracts"),
      ])
      .mockResolvedValueOnce([]);

    const rows = await projectCostCodeRows(7);
    expect(rows.map((r) => r.name)).toEqual(["Site Prep Subcontracts"]);
    // A typed line's ancestors include its parent's line of the same type,
    // which may itself be generated — so the lookup is not limited to originals.
    expect(findMany.mock.calls[1][0].where).toEqual({
      displayCode: { in: ancestorsRequested() },
    });
    expect(ancestorsRequested()).toContain("100-00-0000-00-S");
  });
});

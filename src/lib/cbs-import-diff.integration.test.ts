import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  resetTestDb,
  disconnectTestPrisma,
} from "~/test/integration-db";
import { parseCbsDisplayCode } from "./cbs-tree";
import type { CbsDictionaryRow } from "./cbs-dictionary";
import {
  CBS_IMPORT_FIELDS,
  cbsBulkUpdateSql,
  changedCbsFields,
  type StoredCbsRow,
} from "./cbs-import-diff";

/**
 * Runs the CBS import's bulk UPDATE against Postgres. The unit tests check
 * the SQL text; only a real database proves the casts, the `@map`-ped column
 * and the costCode join actually work — and that a project's grants survive,
 * which is the reason the import updates in place at all.
 *
 * Skipped unless TEST_DATABASE_URL is set — see docs/integration-testing.md.
 */
describeIntegration("integration: CBS bulk update", () => {
  let db: ReturnType<typeof getTestPrisma>;

  beforeAll(() => {
    db = getTestPrisma();
  });
  beforeEach(() => resetTestDb());
  afterAll(() => disconnectTestPrisma());

  function row(displayCode: string, over: Partial<CbsDictionaryRow> = {}) {
    const r: CbsDictionaryRow = {
      ...parseCbsDisplayCode(displayCode),
      name: `Account ${displayCode}`,
      displayCode,
      uom: "LS",
      subReporting: false,
      materialCode: null,
      laborCode: true,
      equipmentCode: null,
      otherCode: null,
      materialType: null,
      costCenter: null,
      costClassification: null,
      status: "Active",
      accountDescription: "",
      l2Description: null,
      core: null,
      coreExtension: null,
      wbs: null,
      p6CostAccount: null,
      gl: null,
      discipline: null,
      costCode: displayCode.replace(/-/g, ""),
      description: null,
      notes: null,
      displayDescription: `${displayCode}:  Account ${displayCode}`,
      rowType: "ORIGINAL",
      generatedFrom: null,
      originalRow: 10,
      expandedRow: 20,
      ...over,
    };
    return r;
  }

  const payload = (rows: CbsDictionaryRow[]) =>
    JSON.stringify(
      rows.map((r) =>
        Object.fromEntries(
          ["costCode", ...CBS_IMPORT_FIELDS].map((f) => [
            f,
            r[f as keyof CbsDictionaryRow],
          ]),
        ),
      ),
    );

  const select = Object.fromEntries(
    [...CBS_IMPORT_FIELDS, "costCode", "id"].map((f) => [f, true]),
  ) as Record<string, true>;

  it("rewrites every column in place, keeping ids and grants", async () => {
    const before = [row("601-05-0000-00-0"), row("601-05-0000-00-S")];
    await db.cbsItem.createMany({ data: before });
    const project = await db.project.create({
      data: {
        displayId: "T1",
        name: "T1",
        description: "",
        allowedFefCbsItems: {
          connect: before.map((b) => ({ costCode: b.costCode })),
        },
      },
    });
    const ids = await db.cbsItem.findMany({ select: { id: true, costCode: true } });

    const after = [
      row("601-05-0000-00-0", {
        name: "Renamed",
        subReporting: null,
        notes: "now with notes",
        originalRow: 41,
        expandedRow: null,
      }),
      row("601-05-0000-00-S", { rowType: "SUB", generatedFrom: "601-05-0000-00-0" }),
    ];
    const n = await db.$executeRawUnsafe(cbsBulkUpdateSql(), payload(after));
    expect(n).toBe(2);

    const stored = (await db.cbsItem.findMany({
      select,
      orderBy: { id: "asc" },
    })) as unknown as (StoredCbsRow & { id: number })[];
    // Every import column now matches the workbook row it was written from.
    for (const s of stored) {
      const want = after.find((a) => a.costCode === s.costCode)!;
      expect(changedCbsFields(s, want)).toBeNull();
    }
    // Same rows, not replacements: the ids hold, so the grants do too.
    expect(stored.map((s) => s.id)).toEqual(ids.map((i) => i.id));
    const granted = await db.cbsItem.count({
      where: { allowedInProjects: { some: { id: project.id } } },
    });
    expect(granted).toBe(2);
  });

  it("touches only rows whose costCode is in the batch", async () => {
    await db.cbsItem.createMany({
      data: [row("601-05-0000-00-0"), row("602-00-0000-00-0")],
    });
    const n = await db.$executeRawUnsafe(
      cbsBulkUpdateSql(),
      payload([row("601-05-0000-00-0", { name: "Renamed" })]),
    );
    expect(n).toBe(1);
    const other = await db.cbsItem.findUnique({
      where: { costCode: "602000000000" },
      select: { name: true },
    });
    expect(other?.name).toBe("Account 602-00-0000-00-0");
  });
});

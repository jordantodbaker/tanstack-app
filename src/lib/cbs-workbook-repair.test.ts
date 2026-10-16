import { describe, expect, it } from "vitest";
import {
  costCodeFor,
  planCbsWorkbookRepair,
  type RepairRow,
} from "./cbs-workbook-repair";

const row = (
  r: number,
  displayCode: string,
  name = "Account",
  l7 = displayCode.slice(-1),
): RepairRow => ({ row: r, displayCode, name, l7 });

describe("planCbsWorkbookRepair", () => {
  it("drops the duplicated backbone segment and keeps the cost type", () => {
    const { fixes, problems } = planCbsWorkbookRepair([
      row(10, "022-05-1000-00-D-0", "Management Deliverables (*)", "D"),
    ]);
    expect(problems).toEqual([]);
    expect(fixes[0]).toMatchObject({
      row: 10,
      was: "022-05-1000-00-D-0",
      displayCode: "022-05-1000-00-D",
      reason: "doubled-cost-type",
    });
  });

  it("keeps the cost type when the zero comes FIRST", () => {
    // "-0-S" is the case that makes L7 untrustworthy: the column still reads
    // "0" there, and following it merges the account's 0 / S / M rows.
    const { fixes } = planCbsWorkbookRepair([
      row(11, "022-00-0000-00-0-S", "Combined Phase (S)", "0"),
    ]);
    expect(fixes[0].displayCode).toBe("022-00-0000-00-S");
    // L7 has to follow the code, so it is corrected too.
    expect(fixes[0].l7).toBe("S");
  });

  it("leaves L7 alone when it already agrees", () => {
    const { fixes } = planCbsWorkbookRepair([
      row(12, "022-05-1000-00-D-0", "Deliverables (*)", "D"),
    ]);
    expect(fixes[0].l7).toBeUndefined();
  });

  it("keeps a doubled all-zero code on the backbone", () => {
    const { fixes } = planCbsWorkbookRepair([
      row(13, "027-00-0000-00-0-0", "Engineering Support (*)", "0"),
    ]);
    expect(fixes[0].displayCode).toBe("027-00-0000-00-0");
  });

  it("refuses when the name's own suffix contradicts the code", () => {
    // An independent witness disagreeing means the rule has met something it
    // was not written for, so it stops rather than guessing.
    const { problems } = planCbsWorkbookRepair([
      row(14, "022-00-0000-00-0-S", "Combined Phase (M)", "0"),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("(M)");
  });

  it("renumbers a division only when the row is the expected one", () => {
    const { fixes, problems } = planCbsWorkbookRepair([
      row(100, "920-00-0000-00-0", "Specialty Services  (*)", "0"),
      row(200, "950-00-0000-00-0", "Startup & Commissioning (*)", "0"),
    ]);
    expect(problems).toEqual([]);
    expect(fixes.map((f) => [f.was, f.displayCode])).toEqual([
      ["920-00-0000-00-0", "950-00-0000-00-0"],
      ["950-00-0000-00-0", "960-00-0000-00-0"],
    ]);
  });

  it("refuses to renumber a row that is not what the correction expects", () => {
    // The guard between repairing a workbook and corrupting one: if 920 holds
    // something else now, moving it to 950 would overwrite a real account.
    const { fixes, skipped } = planCbsWorkbookRepair([
      row(100, "920-00-0000-00-0", "Something Else Entirely (*)", "0"),
    ]);
    expect(fixes).toEqual([]);
    expect(skipped[0]).toContain("not the row this correction was written for");
  });

  it("refuses when two corrections would land on one code", () => {
    const { problems } = planCbsWorkbookRepair([
      row(1, "022-00-0000-00-D-0", "A (*)", "D"),
      row(2, "022-00-0000-00-0-D", "B (*)", "0"),
    ]);
    expect(problems.some((p) => p.includes("would both become"))).toBe(true);
  });

  it("refuses when a correction would land on a row it leaves alone", () => {
    const { problems } = planCbsWorkbookRepair([
      row(1, "022-05-1000-00-D-0", "Deliverables (*)", "D"),
      row(2, "022-05-1000-00-D", "The row already there", "D"),
    ]);
    expect(problems.some((p) => p.includes("already belongs to a row"))).toBe(
      true,
    );
  });

  it("finds nothing to do in a clean workbook", () => {
    // The repair has to be safe to run on an already-repaired file.
    const { fixes, problems } = planCbsWorkbookRepair([
      row(1, "022-05-1000-00-D", "Deliverables (*)", "D"),
      row(2, "950-00-0000-00-0", "Specialty Services (*)", "0"),
      row(3, "960-00-0000-00-0", "Startup & Commissioning (*)", "0"),
    ]);
    expect(fixes).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("ignores blank rows", () => {
    expect(planCbsWorkbookRepair([row(1, "   ", "")]).fixes).toEqual([]);
  });
});

describe("costCodeFor", () => {
  it("is the display code without its dashes", () => {
    expect(costCodeFor("022-05-1000-00-D")).toBe("02205100000D");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandCbsWorkbook } from "../../prisma/cbs-expand";
import { loadCbsWorkbook } from "../../prisma/cbs-workbook";

/**
 * The expand script end to end: a condensed master written here, expanded to
 * a second file, read back by the real loader. The planner's rules have their
 * own tests; this pins what happens to them on the way through Excel — typed
 * cells surviving, the Original Row flag written as a boolean the loader reads
 * back, the Both split landing as the duplicate the loader reports — and that
 * the script refuses its own output.
 */

const HEADERS = [
  "L1",
  "Name",
  "Display Code",
  "Cost Code",
  "UOM",
  "Labor Code",
  "Sub Code",
  "Material Code",
  "Equipment Code",
  "Other Code",
  "Rental Code",
  "Material Type",
  "Cost Center",
  "Cost Classification",
  "G/L",
  "Discipline",
  "Description",
];

type Cell = string | number | boolean | null;

function master(
  code: string,
  name: string,
  over: Partial<Record<(typeof HEADERS)[number], Cell>> = {},
): Cell[] {
  const row: Record<string, Cell> = {
    L1: code.slice(0, 2),
    Name: name,
    "Display Code": code,
    "Cost Code": code.replace(/-/g, ""),
    UOM: "EA",
    "Labor Code": "NO",
    "Sub Code": "NO",
    "Material Code": "NO",
    "Equipment Code": "NO",
    "Other Code": "NO",
    "Rental Code": "NO",
    "Material Type": "n/a",
    // Numbers in the master, as the real one has them.
    "Cost Center": 2010,
    "Cost Classification": "DIRECT LABOR",
    "G/L": 5000,
    Discipline: "Piping",
    Description: `Summary of ${name}.`,
    ...over,
  };
  return HEADERS.map((h) => row[h]);
}

async function writeMaster(path: string, rows: Cell[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Master CBS");
  ws.addRow(HEADERS);
  for (const r of rows) ws.addRow(r.map((v) => (v === null ? undefined : v)));
  await wb.xlsx.writeFile(path);
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cbs-expand-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("expandCbsWorkbook", () => {
  it("writes a workbook the loader reads back as the expanded dictionary", async () => {
    const inPath = join(dir, "master.xlsx");
    const outPath = join(dir, "expanded.xlsx");
    await writeMaster(inPath, [
      master("600-00-0000-00", "Piping", {
        "Labor Code": "YES",
        "Sub Code": "YES",
        "Cost Classification": "INDIRECT",
      }),
      master("601-05-0000-00", "Fittings", {
        "Material Code": "YES",
        "Material Type": "Both",
      }),
    ]);

    const { plan, bytes } = await expandCbsWorkbook({ inPath, outPath });
    expect(plan.problems).toEqual([]);
    expect(bytes).toBeGreaterThan(0);
    expect(existsSync(outPath)).toBe(true);

    const { items, report } = await loadCbsWorkbook(outPath);
    expect(report.sheet).toBe("CBS Expanded");
    expect(report.invalid).toEqual([]);
    // In the loader's own order: the roll-up, then its lines by cost type.
    expect(items.map((i) => i.displayCode)).toEqual([
      "600-00-0000-00-0",
      "600-00-0000-00-S",
      "600-00-0000-00-L",
      "601-05-0000-00-0",
      "601-05-0000-00-M",
    ]);
    const byCode = new Map(items.map((i) => [i.displayCode, i]));

    // The roll-up: marked (*), flagged original, G/L and classification kept.
    expect(byCode.get("600-00-0000-00-0")).toMatchObject({
      name: "Piping (*)",
      isOriginal: true,
      gl: "5000",
      costClassification: "INDIRECT",
      costCode: "600000000000",
      description: "Roll-up code for Piping (summarizes all cost types).",
    });
    // A typed line: its own G/L, the rule's classification where it sets one,
    // the Original Row flag read back as FALSE from a real Excel boolean.
    expect(byCode.get("600-00-0000-00-S")).toMatchObject({
      name: "Piping (S)",
      isOriginal: false,
      gl: "5200",
      costClassification: "DIRECT SUBCONTRACT",
      costCode: "60000000000S",
      description: "Subcontract cost for Piping.",
    });
    expect(byCode.get("600-00-0000-00-L")).toMatchObject({
      gl: "5000",
      costClassification: "INDIRECT",
      laborCode: true,
      subReporting: true,
    });
    // Numbers and pass-through columns survive the trip as text.
    expect(byCode.get("601-05-0000-00-0")).toMatchObject({
      costCenter: "2010",
      discipline: "Piping",
      uom: "EA",
      materialType: "n/a",
    });

    // Both: two -M rows sharing a code. The loader keeps the first (Bulk) and
    // reports the second, rather than refusing the file.
    expect(byCode.get("601-05-0000-00-M")).toMatchObject({
      materialType: "Bulk",
      gl: "5100",
      costClassification: "MATERIALS",
    });
    expect(report.duplicates).toEqual([
      expect.objectContaining({
        displayCode: "601-05-0000-00-M",
        name: "Fittings (M)",
        kept: false,
      }),
    ]);
    expect(plan.warnings.some((w) => w.includes("601-05-0000-00-M"))).toBe(
      true,
    );
  });

  it("refuses its own output, and writes nothing", async () => {
    const inPath = join(dir, "master2.xlsx");
    const expanded = join(dir, "expanded2.xlsx");
    const again = join(dir, "expanded-again.xlsx");
    await writeMaster(inPath, [master("600-00-0000-00", "Piping")]);
    await expandCbsWorkbook({ inPath, outPath: expanded });

    const { plan, bytes } = await expandCbsWorkbook({
      inPath: expanded,
      outPath: again,
    });
    expect(plan.problems[0]).toMatch(/already expanded/);
    expect(bytes).toBeNull();
    expect(existsSync(again)).toBe(false);
  });

  it("plans without writing on a dry run", async () => {
    const inPath = join(dir, "master3.xlsx");
    const outPath = join(dir, "never-written.xlsx");
    await writeMaster(inPath, [
      master("600-00-0000-00", "Piping", { "Labor Code": "YES" }),
    ]);
    const { plan, bytes } = await expandCbsWorkbook({
      inPath,
      outPath,
      write: false,
    });
    expect(plan.stats).toMatchObject({ masterRows: 1, total: 2 });
    expect(bytes).toBeNull();
    expect(existsSync(outPath)).toBe(false);
  });

  it("names a missing master", async () => {
    await expect(
      expandCbsWorkbook({ inPath: join(dir, "nope.xlsx") }),
    ).rejects.toThrow(/nope\.xlsx: not found/);
  });
});

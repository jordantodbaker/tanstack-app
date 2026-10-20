import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatCbsWorkbookReport,
  loadCbsWorkbook,
  loadCbsWorkbookCached,
} from "../../prisma/cbs-workbook";

/**
 * Exercises the workbook loader on small workbooks generated here, so the
 * parsing rules (header detection, code validation, duplicate handling,
 * flag parsing, twin generation, ordering) are pinned without a fixture file.
 */

const HEADERS = [
  "L1", // workbook helper column — ignored by the loader
  "Name",
  "Display Code",
  "UOM",
  "Sub Code",
  "Material Code",
  "Material Type",
  "Cost Center",
  "Cost Classification",
  "Status",
  "Account Description",
  "L2 Description",
  "Core",
  "Core Extension",
  "WBS",
  "P6 Cost Account (L1-4)",
  "G/L",
  "Discipline",
  "Cost Code",
  "Description",
  "Notes",
];

type Cells = Partial<Record<(typeof HEADERS)[number], string>>;

function toRow(cells: Cells): string[] {
  return HEADERS.map((h) => cells[h] ?? "");
}

/** Shorthand for a data row: code + name + flags, with a consistent cost code. */
function r(code: string, name: string, extra: Cells = {}): Cells {
  return {
    Name: name,
    "Display Code": code,
    UOM: "LS",
    "Sub Code": "NO",
    "Material Code": "NO",
    Status: "Active",
    "Account Description": name,
    "Cost Code": code.toUpperCase().replace(/-/g, ""),
    Description: `Summary of ${name}.`,
    ...extra,
  };
}

async function writeWorkbook(
  path: string,
  sheets: { name: string; rows: string[][] }[],
) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const row of s.rows) ws.addRow(row);
  }
  await wb.xlsx.writeFile(path);
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "master-cbs-"));
});

describe("workbook row numbers", () => {
  const H = ["Name", "Display Code", "UOM", "Master CBS Row", "Expanded Row"];

  it("carries both row numbers onto the item", () => {
    // They trace a code back to the spreadsheet. A generated cost-type twin
    // shares its Master CBS Row with the account it came from, which is how
    // you tell it was expanded rather than typed.
    const path = join(dir, "rownums.xlsx");
    return writeWorkbook(path, [
      {
        name: "CBS",
        rows: [H, ["Spool", "601-05-0000-00-0", "LS", "41", "57"]],
      },
    ])
      .then(() => loadCbsWorkbook(path))
      .then(({ items }) => {
        expect(items[0]).toMatchObject({ masterCbsRow: 41, expandedRow: 57 });
      });
  });

  it("leaves them null when the columns are absent or blank", async () => {
    // Older copies of the workbook have no such columns, and must still load.
    const path = join(dir, "rownums-missing.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS",
        rows: [
          ["Name", "Display Code", "UOM"],
          ["Spool", "601-05-0000-00-0", "LS"],
        ],
      },
    ]);
    const { items } = await loadCbsWorkbook(path);
    expect(items[0]).toMatchObject({ masterCbsRow: null, expandedRow: null });
  });

  it("ignores a value that is not a number", async () => {
    const path = join(dir, "rownums-junk.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS",
        rows: [H, ["Spool", "601-05-0000-00-0", "LS", "n/a", "12.9"]],
      },
    ]);
    const { items } = await loadCbsWorkbook(path);
    expect(items[0].masterCbsRow).toBeNull();
    // A fractional row number is meaningless; take the whole part.
    expect(items[0].expandedRow).toBe(12);
  });
});

describe("loadCbsWorkbookCached", () => {
  const HEADER = [
    "L1",
    "L2",
    "L3",
    "L4",
    "L5",
    "L6",
    "L7",
    "Name",
    "Display Code",
    "UOM",
  ];
  const row = (name: string) => [
    "06",
    "0",
    "10",
    "00",
    "00",
    "00",
    "0",
    name,
    "060-10-0000-00-0",
    "LS",
  ];

  it("reuses the parse while the file is untouched", async () => {
    const path = join(dir, "cache-same.xlsx");
    await writeWorkbook(path, [{ name: "CBS", rows: [HEADER, row("First")] }]);
    const a = await loadCbsWorkbookCached(path);
    const b = await loadCbsWorkbookCached(path);
    // The same object, not merely equal: that is what makes it a cache.
    expect(b).toBe(a);
  });

  it("re-parses when the file is replaced", async () => {
    // CBS.xlsx is replaced often. A cache keyed on the path alone would keep
    // serving the old workbook, which is worse than no cache at all.
    const path = join(dir, "cache-replaced.xlsx");
    await writeWorkbook(path, [{ name: "CBS", rows: [HEADER, row("Before")] }]);
    const before = await loadCbsWorkbookCached(path);
    expect(before.items[0].name).toBe("Before");

    // Writing alone can land inside the filesystem's timestamp resolution, so
    // move the mtime deliberately — the point is that a CHANGED file is noticed.
    await writeWorkbook(path, [{ name: "CBS", rows: [HEADER, row("After")] }]);
    const later = new Date(Date.now() + 2000);
    utimesSync(path, later, later);

    const after = await loadCbsWorkbookCached(path);
    expect(after).not.toBe(before);
    expect(after.items[0].name).toBe("After");
  });

  it("keeps separate files apart", async () => {
    const one = join(dir, "cache-one.xlsx");
    const two = join(dir, "cache-two.xlsx");
    await writeWorkbook(one, [{ name: "CBS", rows: [HEADER, row("One")] }]);
    await writeWorkbook(two, [{ name: "CBS", rows: [HEADER, row("Two")] }]);
    expect((await loadCbsWorkbookCached(one)).items[0].name).toBe("One");
    expect((await loadCbsWorkbookCached(two)).items[0].name).toBe("Two");
    // Back to the first: a one-entry cache must not have poisoned it.
    expect((await loadCbsWorkbookCached(one)).items[0].name).toBe("One");
  });
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCbsWorkbook", () => {
  it("parses the Master CBS sheet, validates codes, de-duplicates and expands twins", async () => {
    const path = join(dir, "master.xlsx");
    await writeWorkbook(path, [
      {
        name: "Master CBS",
        rows: [
          HEADERS,
          toRow(
            r("100-00-0000-00-0", "Civil", {
              "Sub Code": "YES",
              "Material Code": "YES",
            }),
          ),
          toRow(
            r("101-00-0000-00-0", "Civil Shop Materials", {
              "Material Code": "YES",
            }),
          ),
          // Already present in the workbook → its generated twin is skipped.
          toRow(r("101-00-0000-00-M", "Civil Shop Materials")),
          // Cost Code cell disagrees with the Display Code → derived wins, counted.
          toRow(r("101-05-0000-00-0", "Earthwork", { "Cost Code": "WRONG" })),
          toRow(r("101-10-0000-00-0", "Piling")),
          // Duplicate of a named row → dropped.
          toRow(r("101-10-0000-00-0", "Piling (dup)")),
          // Nameless row followed by its named duplicate → the named one wins.
          toRow(r("700-00-0000-00-0", "")),
          toRow(r("700-00-0000-00-0", "Electrical")),
          // Invalid code → reported and skipped.
          toRow(r("BAD-CODE", "Oops")),
          // Blank row → ignored entirely.
          toRow({}),
          // Blank flags → null.
          toRow(
            r("101-15-0000-00-0", "Underground", {
              "Sub Code": "",
              "Material Code": "",
            }),
          ),
          // Lower-case code → normalized to upper case.
          toRow(r("101-20-0000-00-l", "Lowercase")),
        ],
      },
    ]);

    const { items, report } = await loadCbsWorkbook(path);

    expect(report.sheet).toBe("Master CBS");
    expect(report.sheetRows).toBe(11);
    expect(report.originals).toBe(8);
    expect(report.generatedSub).toBe(1);
    expect(report.generatedMaterial).toBe(1);
    expect(report.skippedExistingSub).toBe(0);
    expect(report.skippedExistingMaterial).toBe(1);
    expect(report.costCodeMismatches).toBe(1);
    expect(report.invalid).toEqual([
      {
        row: 10,
        displayCode: "BAD-CODE",
        name: "Oops",
        reason: "display code is not XXX-XX-XXXX-XX-X",
      },
    ]);
    expect(report.duplicates).toEqual([
      {
        row: 7,
        displayCode: "101-10-0000-00-0",
        name: "Piling (dup)",
        kept: false,
      },
      {
        row: 9,
        displayCode: "700-00-0000-00-0",
        name: "Electrical",
        kept: true,
      },
    ]);

    // Dictionary order: parents first, each original followed by its twins.
    expect(items.map((i) => i.displayCode)).toEqual([
      "100-00-0000-00-0",
      "100-00-0000-00-S",
      "100-00-0000-00-M",
      "101-00-0000-00-0",
      "101-00-0000-00-M",
      "101-05-0000-00-0",
      "101-10-0000-00-0",
      "101-15-0000-00-0",
      "101-20-0000-00-L",
      "700-00-0000-00-0",
    ]);

    const byCode = new Map(items.map((i) => [i.displayCode, i]));
    expect(byCode.get("101-10-0000-00-0")?.name).toBe("Piling");
    expect(byCode.get("700-00-0000-00-0")?.name).toBe("Electrical");
    expect(byCode.get("101-05-0000-00-0")?.costCode).toBe("101050000000");
    expect(byCode.get("101-15-0000-00-0")).toMatchObject({
      subReporting: null,
      materialCode: null,
    });
    expect(byCode.get("100-00-0000-00-0")).toMatchObject({
      l1: "100",
      l2: "00",
      l6: "0",
      subReporting: true,
      materialCode: true,
      rowType: "ORIGINAL",
      displayDescription: "100-00-0000-00-0:  Civil",
    });
    expect(byCode.get("100-00-0000-00-S")).toMatchObject({
      name: "Civil Subcontracts",
      l6: "S",
      costCode: "10000000000S",
      gl: "5200",
      rowType: "SUB",
      generatedFrom: "100-00-0000-00-0",
    });
    // The workbook's own M row is kept as an original, not replaced by a twin.
    expect(byCode.get("101-00-0000-00-M")?.rowType).toBe("ORIGINAL");
  });

  it("finds the header below a title block and falls back to the first sheet", async () => {
    const path = join(dir, "titled.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS S-M Generated",
        rows: [
          ["CBS Dictionary – Civil"],
          ["Live list of CBS rows"],
          ["Total rows:", "", "1"],
          HEADERS,
          toRow(r("100-00-0000-00-0", "Civil")),
        ],
      },
    ]);
    const { items, report } = await loadCbsWorkbook(path);
    expect(report.sheet).toBe("CBS S-M Generated");
    expect(items.map((i) => i.displayCode)).toEqual(["100-00-0000-00-0"]);
  });

  /**
   * The 2026-10 workbook changed shape: the sheet is "CBS Expanded", summary
   * rows are written without a cost-type segment and marked "(*)", every name
   * carries its cost type in parentheses, and three more flag columns arrived.
   * Everything downstream is built on the five-segment code where "0" is the
   * summary type, so the loader absorbs that difference rather than teaching
   * the whole app a second shape.
   */
  it("normalizes a summary code and strips the cost-type suffix from the name", async () => {
    const path = join(dir, "expanded.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS Expanded",
        rows: [
          [...HEADERS, "Labor Code", "Equipment Code", "Other Code"],
          // A four-segment summary row, as the new sheet writes it.
          toRow({ ...r("012-05-0000-00", "Overhead (*)"), "Sub Code": "NO" }),
          // Its costed child, already expanded in the sheet.
          toRow({
            ...r("012-05-1000-00-L", "Executive (L)"),
            "Sub Code": "NO",
          }),
        ],
      },
    ]);
    const { items, report } = await loadCbsWorkbook(path);

    expect(report.sheet).toBe("CBS Expanded");
    expect(report.invalid).toEqual([]);
    // The summary gains the backbone segment; the costed row is untouched.
    expect(items.map((i) => i.displayCode)).toEqual([
      "012-05-0000-00-0",
      "012-05-1000-00-L",
    ]);
    // Parentheses that ARE the cost type go; the name is otherwise verbatim.
    expect(items.map((i) => i.name)).toEqual(["Overhead", "Executive"]);
    // The normalized code drives the levels, so "0" is the summary's L6.
    expect(items[0]).toMatchObject({ l1: "012", l2: "05", l6: "0" });
  });

  it("reads the three cost-type flag columns alongside Sub and Material", async () => {
    const path = join(dir, "flags.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS Expanded",
        rows: [
          [...HEADERS, "Labor Code", "Equipment Code", "Other Code"],
          [
            ...toRow(
              r("500-00-0000-00-0", "Equipment (*)", {
                "Sub Code": "YES",
                "Material Code": "NO",
              }),
            ),
            "YES",
            "YES",
            "",
          ],
        ],
      },
    ]);
    const { items } = await loadCbsWorkbook(path);
    expect(items[0]).toMatchObject({
      subReporting: true,
      materialCode: false,
      laborCode: true,
      equipmentCode: true,
      // A blank column is unknown, not "NO".
      otherCode: null,
    });
  });

  it("still rejects a code with a doubled cost type", async () => {
    // "022-00-0000-00-0-S" — the expansion appended the type instead of
    // replacing the backbone "0". Six segments is not a shape we normalize;
    // rejecting it is what surfaced twelve of these in the real workbook.
    const path = join(dir, "doubled.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS Expanded",
        rows: [HEADERS, toRow(r("022-00-0000-00-0-S", "Combined Phase (S)"))],
      },
    ]);
    const { items, report } = await loadCbsWorkbook(path);
    expect(items).toEqual([]);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].displayCode).toBe("022-00-0000-00-0-S");
  });

  it("leaves a name whose own text ends in parentheses alone", async () => {
    // Only a single-character marker is a cost type. "(Class 4-3)" is content.
    const path = join(dir, "parens.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS Expanded",
        rows: [
          HEADERS,
          toRow(r("025-00-0000-00-0", "Preliminary Design – FEED (Class 4-3)")),
        ],
      },
    ]);
    const { items } = await loadCbsWorkbook(path);
    expect(items[0].name).toBe("Preliminary Design – FEED (Class 4-3)");
  });

  it("rejects a workbook without a Display Code header", async () => {
    const path = join(dir, "no-header.xlsx");
    await writeWorkbook(path, [
      {
        name: "Master CBS",
        rows: [
          ["Name", "Code"],
          ["Civil", "100"],
        ],
      },
    ]);
    await expect(loadCbsWorkbook(path)).rejects.toThrow(/no header row/);
  });

  /**
   * The sheet carries L1–L7 helper columns beside the Display Code. The loader
   * derives every level segment from the CODE, because the two disagreed in
   * ~1,100 rows of the first master and the code is what the app stores on
   * estimate rows. That makes a half-finished renumber — helper columns moved,
   * Display Code left behind — silent, so the report calls it out.
   */
  it("reports rows whose L1–L7 columns disagree with the Display Code", async () => {
    const FULL = [
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
      "L6",
      "L7",
      "Name",
      "Display Code",
      "Cost Code",
    ];
    /** A row with explicit segment columns, which may or may not match the code. */
    const seg = (segments: string, code: string, name: string): string[] => [
      segments.slice(0, 2),
      segments.slice(2, 3),
      segments.slice(3, 5),
      segments.slice(5, 7),
      segments.slice(7, 9),
      segments.slice(9, 11),
      segments.slice(11, 12),
      name,
      code,
      code.replace(/-/g, ""),
    ];

    const path = join(dir, "segments.xlsx");
    await writeWorkbook(path, [
      {
        name: "CBS",
        rows: [
          FULL,
          // Agrees — not reported.
          seg("100000000000", "100-00-0000-00-0", "Civil"),
          // A renumbered block: columns say 680, the codes still say 700.
          seg("680000000000", "700-00-0000-00-0", "Steam Tracing & Tubing"),
          seg("68010000000L", "700-10-0000-00-L", "Install Supports"),
          seg("68020000000L", "700-20-0000-00-L", "Install Steam Tracing"),
          // A different move, so a second group.
          seg("01410000000E", "054-10-0000-00-E", "Owned Equipment"),
        ],
      },
    ]);

    const { items, report } = await loadCbsWorkbook(path);

    // One line per division move, not per row — a real block runs to dozens.
    expect(report.segmentMismatches).toEqual([
      {
        columnsL1: "680",
        codeL1: "700",
        rows: 3,
        sample: { row: 3, name: "Steam Tracing & Tubing" },
      },
      {
        columnsL1: "014",
        codeL1: "054",
        rows: 1,
        sample: { row: 6, name: "Owned Equipment" },
      },
    ]);

    // The code still wins: the rows import under 700, which is the point.
    expect(items.find((i) => i.name === "Steam Tracing & Tubing")?.l1).toBe(
      "700",
    );

    const text = formatCbsWorkbookReport(report);
    expect(text).toContain("4 row(s) whose L1–L7 columns disagree");
    expect(text).toContain("L1 columns say 680, Display Codes say 700");
  });

  it("reports nothing when the sheet has no L1–L7 columns to compare", async () => {
    // The dictionary-style exports carry only a subset; absence is not a
    // disagreement.
    const path = join(dir, "no-segments.xlsx");
    await writeWorkbook(path, [
      { name: "CBS", rows: [HEADERS, toRow(r("100-00-0000-00-0", "Civil"))] },
    ]);
    const { report } = await loadCbsWorkbook(path);
    expect(report.segmentMismatches).toEqual([]);
  });
});

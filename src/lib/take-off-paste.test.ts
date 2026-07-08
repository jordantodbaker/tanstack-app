import { describe, expect, it } from "vitest";
import {
  parseTakeOffPaste,
  extractTakeOffCodes,
  splitRowsByDiscipline,
} from "./take-off-paste";
import { makeFefRow } from "./fef-helpers";
import { rowsToCsv } from "./csv-export";
import { makeTakeOffCsvColumns } from "./take-off-csv";
import type { CbsOption } from "./types";

const OPTS: CbsOption[] = [
  {
    displayCode: "601-10-0000-00-L",
    costCode: "601100000L",
    name: "Pipe, Carbon Steel",
    uom: "LF",
    displayDescription: null,
    subReporting: null,
  },
  {
    displayCode: "602-10-0000-00-L",
    costCode: "602100000L",
    name: "Pipe, Stainless",
    uom: "LF",
    displayDescription: null,
    subReporting: null,
  },
];

const tsv = (rows: string[][]) => rows.map((r) => r.join("\t")).join("\n");

describe("parseTakeOffPaste", () => {
  it("maps columns and resolves a CBS code to name + unit", () => {
    const { rows } = parseTakeOffPaste(
      tsv([["601-10-0000-00-L", "10ft spool", "100", "1.5", "55"]]),
      OPTS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "601-10-0000-00-L",
      name: "Pipe, Carbon Steel",
      unit: "LF",
      description: "10ft spool",
      quantity: "100",
      laborFactor: "1.5",
      laborRate: "55",
    });
  });

  it("matches the display code even without hyphens", () => {
    const noHyphens = "601-10-0000-00-L".replace(/-/g, "");
    const { rows, unmatchedCodes } = parseTakeOffPaste(
      tsv([[noHyphens, "spool", "10", "", ""]]),
      OPTS,
    );
    expect(rows[0].id).toBe("601-10-0000-00-L"); // canonical display code stored
    expect(rows[0].name).toBe("Pipe, Carbon Steel");
    expect(unmatchedCodes).toEqual([]);
  });

  it("matches the cost code and stores the canonical display code", () => {
    const { rows } = parseTakeOffPaste(
      tsv([["602100000L", "spool", "10", "", ""]]),
      OPTS,
    );
    expect(rows[0].id).toBe("602-10-0000-00-L");
    expect(rows[0].name).toBe("Pipe, Stainless");
    expect(rows[0].unit).toBe("LF");
  });

  it("matching is case-insensitive", () => {
    const { rows } = parseTakeOffPaste(
      tsv([["601-10-0000-00-l", "spool", "10", "", ""]]),
      OPTS,
    );
    expect(rows[0].id).toBe("601-10-0000-00-L");
  });

  it("derives laborHours as quantity × factor (factor defaults to 1)", () => {
    const { rows } = parseTakeOffPaste(
      tsv([
        ["601-10-0000-00-L", "", "100", "1.5", ""],
        ["602-10-0000-00-L", "", "40", "", ""],
      ]),
      OPTS,
    );
    expect(rows[0].laborHours).toBe("150.0");
    expect(rows[1].laborHours).toBe("40.0"); // no factor → ×1
  });

  it("imports Role, Schedule, and Notes (global — they cross projects)", () => {
    const { rows } = parseTakeOffPaste(
      tsv([
        [
          "601-10-0000-00-L",
          "spool",
          "10",
          "1",
          "55",
          "",
          "Pipefitter",
          "1x6x10",
          "field note",
        ],
      ]),
      OPTS,
    );
    expect(rows[0]).toMatchObject({
      role: "Pipefitter",
      schedule: "1x6x10",
      notes: "field note",
      laborRate: "55",
    });
  });

  it("keeps an unrecognized code as-is and reports it", () => {
    const { rows, unmatchedCodes } = parseTakeOffPaste(
      tsv([["999-99-9999-99-Z", "Custom item", "5", "", ""]]),
      OPTS,
    );
    expect(rows[0].id).toBe("999-99-9999-99-Z");
    expect(rows[0].name).toBe("");
    expect(unmatchedCodes).toEqual(["999-99-9999-99-Z"]);
  });

  it("reports each unmatched code once, in first-seen order", () => {
    const { unmatchedCodes } = parseTakeOffPaste(
      tsv([
        ["AAA", "", "1", "", ""],
        ["BBB", "", "1", "", ""],
        ["AAA", "", "2", "", ""],
      ]),
      OPTS,
    );
    expect(unmatchedCodes).toEqual(["AAA", "BBB"]);
  });

  it("strips currency symbols and thousands separators from numbers", () => {
    const { rows } = parseTakeOffPaste(
      tsv([["601-10-0000-00-L", "", "1,200", "1", "$45.50"]]),
      OPTS,
    );
    expect(rows[0].quantity).toBe("1200");
    expect(rows[0].laborRate).toBe("45.50");
    expect(rows[0].laborHours).toBe("1200.0");
  });

  it("skips blank lines and fully-empty rows", () => {
    const { rows } = parseTakeOffPaste(
      "601-10-0000-00-L\tspool\t10\n\n\t\t\n602-10-0000-00-L\tother\t5",
      OPTS,
    );
    expect(rows).toHaveLength(2);
  });

  it("skips a leading header row", () => {
    const { rows } = parseTakeOffPaste(
      tsv([
        ["CBS Code", "Description", "Quantity", "Labor Factor", "Labor Rate"],
        ["601-10-0000-00-L", "spool", "10", "", ""],
      ]),
      OPTS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("601-10-0000-00-L");
  });

  it("handles CRLF line endings and missing trailing columns", () => {
    const { rows } = parseTakeOffPaste(
      "601-10-0000-00-L\tspool\r\n602-10-0000-00-L\tother\t5",
      OPTS,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: "spool", quantity: "" });
    expect(rows[1].quantity).toBe("5");
  });

  it("allows a description-only row (no code) with a blank id", () => {
    const { rows, unmatchedCodes } = parseTakeOffPaste(
      tsv([["", "Note row", "3", "", ""]]),
      OPTS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("");
    expect(rows[0].description).toBe("Note row");
    expect(unmatchedCodes).toEqual([]); // empty code isn't "unmatched"
  });

  it("returns nothing for empty input", () => {
    expect(parseTakeOffPaste("", OPTS)).toEqual({
      rows: [],
      unmatchedCodes: [],
    });
  });

  describe("area resolution", () => {
    const AREAS = [
      { value: "3", label: "A1 — Foundation" },
      { value: "7", label: "A2 — Structure" },
    ];

    it("resolves an area cell by its id", () => {
      const { rows } = parseTakeOffPaste(
        tsv([["601-10-0000-00-L", "x", "1", "", "", "3"]]),
        OPTS,
        AREAS,
      );
      expect(rows[0].area).toBe("3");
    });

    it("resolves an area cell by its label (case-insensitive)", () => {
      const { rows } = parseTakeOffPaste(
        tsv([["601-10-0000-00-L", "x", "1", "", "", "a2 — structure"]]),
        OPTS,
        AREAS,
      );
      expect(rows[0].area).toBe("7");
    });

    it("leaves area blank for an unrecognized or empty area cell", () => {
      const { rows } = parseTakeOffPaste(
        tsv([
          ["601-10-0000-00-L", "x", "1", "", "", "Nowhere"],
          ["602-10-0000-00-L", "y", "1", "", "", ""],
        ]),
        OPTS,
        AREAS,
      );
      expect(rows[0].area).toBe("");
      expect(rows[1].area).toBe("");
    });
  });
});

describe("CSV import (comma-separated, incl. the app's own export)", () => {
  it("round-trips the CSV export: BOM + header + CRLF + quoted comma cell", () => {
    const source = [
      makeFefRow({
        id: "601-10-0000-00-L",
        name: "Pipe, Carbon Steel",
        unit: "LF",
        description: "Spool, 6in", // comma → quoted by the exporter
        quantity: "100",
        laborFactor: "1.5",
        laborRate: "55",
        laborHours: "150.0",
        area: "3",
        role: "Pipefitter",
        schedule: "1x6x10",
        notes: "note, with comma",
      }),
    ];
    const areaLabel = (id: string) =>
      id === "3" ? "A1 — Foundation" : id;
    // downloadCsv prepends the UTF-8 BOM; simulate that here.
    const csv = "﻿" + rowsToCsv(source, makeTakeOffCsvColumns(areaLabel));

    const { rows } = parseTakeOffPaste(csv, OPTS, [
      { value: "3", label: "A1 — Foundation" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "601-10-0000-00-L",
      name: "Pipe, Carbon Steel",
      description: "Spool, 6in",
      quantity: "100",
      laborFactor: "1.5",
      laborRate: "55",
      area: "3", // Area label resolved back to its id
      role: "Pipefitter", // global → round-trips across projects
      schedule: "1x6x10",
      notes: "note, with comma", // quoted comma survived
    });
  });

  it("splits on commas when the block has no tabs", () => {
    const { rows } = parseTakeOffPaste("601-10-0000-00-L,desc,10,1,55", OPTS);
    expect(rows[0]).toMatchObject({
      id: "601-10-0000-00-L",
      description: "desc",
      quantity: "10",
      laborRate: "55",
    });
  });

  it("prefers tabs when present, so a comma inside an Excel cell is literal", () => {
    const { rows } = parseTakeOffPaste("601-10-0000-00-L\tPipe, 6in\t10", OPTS);
    expect(rows[0].description).toBe("Pipe, 6in");
    expect(rows[0].quantity).toBe("10");
  });

  it("unescapes doubled double-quotes inside a quoted field", () => {
    const { rows } = parseTakeOffPaste(
      '601-10-0000-00-L,"a ""quoted"" note",10',
      OPTS,
    );
    expect(rows[0].description).toBe('a "quoted" note');
  });
});

describe("extractTakeOffCodes", () => {
  it("returns distinct, non-empty codes (skipping header/blank/code-less rows)", () => {
    const text = tsv([
      ["CBS Code", "Description", "Quantity"], // header
      ["601-10-0000-00-L", "a", "1"],
      ["602-10-0000-00-L", "b", "2"],
      ["601-10-0000-00-L", "c", "3"], // duplicate code
      ["", "note only", "4"], // code-less
    ]);
    expect(extractTakeOffCodes(text)).toEqual([
      "601-10-0000-00-L",
      "602-10-0000-00-L",
    ]);
  });

  it("is empty for blank input", () => {
    expect(extractTakeOffCodes("")).toEqual([]);
  });
});

describe("splitRowsByDiscipline", () => {
  // 601 → piping, 012 → administration, 100 → civil (per disciplines-data).
  const piping = makeFefRow({ id: "601-C0-0000-00-M", name: "Pipe" });
  const admin = makeFefRow({ id: "012-05-5000-00-L", name: "Marketing" });
  const civil = makeFefRow({ id: "100-00-0000-00-L", name: "Civil thing" });
  const codeless = makeFefRow({ id: "", name: "Note" });
  const blank = makeFefRow({ id: "__fe-blank-3" });

  it("keeps same-discipline, code-less, and blank rows local", () => {
    const { local, byDiscipline } = splitRowsByDiscipline(
      [piping, codeless, blank],
      "piping",
    );
    expect(local).toEqual([piping, codeless, blank]);
    expect(byDiscipline.size).toBe(0);
  });

  it("routes off-discipline rows, grouped by their discipline", () => {
    const { local, byDiscipline } = splitRowsByDiscipline(
      [piping, admin, civil],
      "piping",
    );
    expect(local).toEqual([piping]);
    expect(byDiscipline.get("administration")).toEqual([admin]);
    expect(byDiscipline.get("civil")).toEqual([civil]);
  });

  it("routes everything when viewing an unrelated discipline", () => {
    const { local, byDiscipline } = splitRowsByDiscipline([piping, admin], "civil");
    expect(local).toEqual([]);
    expect(byDiscipline.get("piping")).toEqual([piping]);
    expect(byDiscipline.get("administration")).toEqual([admin]);
  });
});

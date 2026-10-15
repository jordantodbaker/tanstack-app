import { describe, expect, it } from "vitest";
import {
  buildCoreLinks,
  coreCodeCandidates,
  type CoreLinkRow,
} from "./cbs-core-links";

const row = (
  displayCode: string,
  name: string,
  core: string | null = null,
): CoreLinkRow => ({
  displayCode,
  costCode: displayCode.replace(/-/g, ""),
  name,
  core,
});

/**
 * Field Staff in 050 Field Indirects, with three disciplines pointing at it —
 * the arrangement the Core column exists for.
 */
const CATALOG: CoreLinkRow[] = [
  row("052-00-0000-00-0", "Field Staff"),
  row("054-20-0000-00-0", "Third Party Rental Equipment"),
  // Excel drops the leading zero, so these arrive ten characters long.
  row("102-00-0000-00-0", "Civil Field Staff", "5200000000"),
  row("232-00-0000-00-0", "Concrete Field Staff", "5200000000"),
  row("602-00-0000-00-0", "Pipe Shop Field Staff", "5200000000"),
  row("104-20-0000-00-0", "Civil Equipment Rental", "5420000000"),
  row("600-00-0000-00-0", "Piping"),
];

describe("coreCodeCandidates", () => {
  it("restores the leading zero Excel ate", () => {
    // 5215050000 is 052-15-0500-00 with its leading zero lost to the cell's
    // number format, and a four-segment code means the "-0" backbone row.
    expect(coreCodeCandidates("5215050000")).toContain("052150500000");
  });

  it("offers both readings of an eleven-character value", () => {
    // 53000000000 is either 530-00-0000-00-0 or 053-00-0000-00-0. Only the
    // catalog can say, so both are returned and the caller decides.
    const c = coreCodeCandidates("53000000000");
    expect(c).toContain("530000000000");
    expect(c).toContain("053000000000");
  });

  it("passes a full twelve-character code straight through", () => {
    expect(coreCodeCandidates("03000000000I")).toEqual(["03000000000I"]);
  });

  it("ignores blanks and anything too long to be a code", () => {
    expect(coreCodeCandidates("  ")).toEqual([]);
    expect(coreCodeCandidates("0123456789012345")).toEqual([]);
  });
});

describe("buildCoreLinks", () => {
  it("gathers one account's items from every discipline that points at it", () => {
    const { targets } = buildCoreLinks(CATALOG);
    const staff = targets.find((t) => t.code === "052-00-0000-00-0")!;
    expect(staff.name).toBe("Field Staff");
    expect(staff.total).toBe(3);
    expect(staff.disciplineCount).toBe(3);
    expect(staff.counts).toMatchObject({ civil: 1, concrete: 1, piping: 1 });
    expect(staff.items.map((i) => i.displayCode)).toEqual([
      "102-00-0000-00-0",
      "232-00-0000-00-0",
      "602-00-0000-00-0",
    ]);
  });

  it("sorts the accounts doing the most cross-discipline work first", () => {
    const { targets } = buildCoreLinks(CATALOG);
    expect(targets[0].code).toBe("052-00-0000-00-0");
  });

  it("counts coverage per discipline over every row, coded or not", () => {
    const { coverage } = buildCoreLinks(CATALOG);
    const piping = coverage.find((c) => c.discipline === "piping")!;
    // Two piping rows: the Pipe Shop Field Staff link and the 600 root.
    expect(piping).toMatchObject({ coded: 1, total: 2 });
  });

  it("reports a core code that points at nothing, rather than dropping it", () => {
    // 497 real rows point at 030-00-0000-00-I, a cost type the current
    // workbook no longer has. Silently ignoring them would hide the breakage.
    const { problems, totals } = buildCoreLinks([
      ...CATALOG,
      row("401-05-0000-00-M", "Basic Site Materials", "03000000000I"),
    ]);
    const missing = problems.find((p) => p.raw === "03000000000I")!;
    expect(missing).toMatchObject({ reason: "missing", count: 1 });
    expect(missing.sample).toContain("401-05-0000-00-M");
    expect(totals.unresolved).toBe(1);
  });

  it("calls a value ambiguous when two real accounts would match", () => {
    const rows = [
      ...CATALOG,
      row("530-00-0000-00-0", "Electrical Materials"),
      row("053-00-0000-00-0", "Field Support Supplies"),
      row("233-00-0000-00-0", "Concrete Support Supplies", "53000000000"),
    ];
    const { problems } = buildCoreLinks(rows);
    const amb = problems.find((p) => p.raw === "53000000000")!;
    expect(amb.reason).toBe("ambiguous");
    expect(amb.candidates).toEqual(
      expect.arrayContaining(["530000000000", "053000000000"]),
    );
  });

  it("lists only disciplines that actually link somewhere", () => {
    const { disciplines } = buildCoreLinks(CATALOG);
    expect(disciplines).toEqual(["civil", "concrete", "piping"]);
  });

  it("totals the whole picture, including what did not link", () => {
    const { totals } = buildCoreLinks(CATALOG);
    expect(totals).toMatchObject({
      rows: 7,
      coded: 4,
      linked: 4,
      unresolved: 0,
      targets: 2,
      crossDiscipline: 1,
    });
  });
});

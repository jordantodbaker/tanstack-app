import { describe, expect, it } from "vitest";
import { makeFefRow } from "./fef-helpers";
import {
  buildCvrDraftFromFefRows,
  isConvertibleRow,
} from "./fef-to-cvr";

const OPTS = { discipline: "piping", disciplineLabel: "Piping" };

describe("isConvertibleRow", () => {
  it("is false for an untouched blank row", () => {
    expect(isConvertibleRow(makeFefRow())).toBe(false);
  });
  it("is true when a real CBS code is present", () => {
    expect(isConvertibleRow(makeFefRow({ id: "601-10-0000-00-L" }))).toBe(true);
  });
  it("is true when any field holds user data (even without a code)", () => {
    expect(isConvertibleRow(makeFefRow({ name: "Extra weld" }))).toBe(true);
  });
  it("is false for a loaded-blank sentinel with no data", () => {
    expect(isConvertibleRow(makeFefRow({ id: "__fe-blank-loaded-7" }))).toBe(
      false,
    );
  });
});

describe("buildCvrDraftFromFefRows", () => {
  const rows = [
    makeFefRow({
      id: "601-10-0000-00-L",
      name: "Pipe supports",
      laborHours: "10",
      laborRate: "50",
      area: "A1",
    }),
    makeFefRow({
      id: "602-10-0000-00-L",
      name: "Hangers",
      laborHours: "4",
      laborRate: "25",
      area: "A1",
    }),
  ];

  it("maps each row to a LABOR line (hours × rate) and sums cost + hours", () => {
    const d = buildCvrDraftFromFefRows(rows, OPTS);
    expect(d.lineItems).toHaveLength(2);
    expect(d.lineItems[0]).toMatchObject({
      description: "Pipe supports",
      cbsCode: "601-10-0000-00-L",
      costType: "LABOR",
      quantity: 10,
      unit: "HR",
      unitRate: 50,
      position: 0,
    });
    expect(d.costImpact).toBe(10 * 50 + 4 * 25); // 600
    expect(d.laborHoursImpact).toBe(14);
  });

  it("collects distinct CBS codes and carries the discipline", () => {
    const d = buildCvrDraftFromFefRows(rows, OPTS);
    expect(d.cbsCodes).toEqual(["601-10-0000-00-L", "602-10-0000-00-L"]);
    expect(d.discipline).toBe("piping");
  });

  it("adopts the shared area when every row has the same one", () => {
    expect(buildCvrDraftFromFefRows(rows, OPTS).area).toBe("A1");
  });

  it("leaves area blank when rows span different areas", () => {
    const mixed = [rows[0], makeFefRow({ ...rows[1], area: "A2" })];
    expect(buildCvrDraftFromFefRows(mixed, OPTS).area).toBe("");
  });

  it("leaves area blank when any row is unassigned", () => {
    const partial = [rows[0], makeFefRow({ ...rows[1], area: "" })];
    expect(buildCvrDraftFromFefRows(partial, OPTS).area).toBe("");
  });

  it("titles with a pluralized item count and the discipline label", () => {
    expect(buildCvrDraftFromFefRows(rows, OPTS).title).toBe(
      "Field change — Piping (2 items)",
    );
    expect(buildCvrDraftFromFefRows([rows[0]], OPTS).title).toBe(
      "Field change — Piping (1 item)",
    );
  });

  it("drops non-convertible blank rows before mapping", () => {
    const withBlank = [...rows, makeFefRow(), makeFefRow({ id: "" })];
    const d = buildCvrDraftFromFefRows(withBlank, OPTS);
    expect(d.lineItems).toHaveLength(2);
  });

  it("includes a coded row with no labor as a zero-cost line (code still captured)", () => {
    const d = buildCvrDraftFromFefRows(
      [makeFefRow({ id: "601-10-0000-00-L", name: "TBD scope" })],
      OPTS,
    );
    expect(d.lineItems).toHaveLength(1);
    expect(d.costImpact).toBe(0);
    expect(d.cbsCodes).toEqual(["601-10-0000-00-L"]);
  });

  it("returns an empty, zeroed draft when nothing is convertible", () => {
    const d = buildCvrDraftFromFefRows([makeFefRow(), makeFefRow()], OPTS);
    expect(d.lineItems).toEqual([]);
    expect(d.costImpact).toBe(0);
    expect(d.laborHoursImpact).toBe(0);
    expect(d.cbsCodes).toEqual([]);
    expect(d.description).toBe("");
    expect(d.title).toBe("Field change — Piping (0 items)");
  });

  it("coerces non-numeric labor fields to 0", () => {
    const d = buildCvrDraftFromFefRows(
      [makeFefRow({ id: "601-10-0000-00-L", laborHours: "", laborRate: "abc" })],
      OPTS,
    );
    expect(d.costImpact).toBe(0);
    expect(d.laborHoursImpact).toBe(0);
  });
});

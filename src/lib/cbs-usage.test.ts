import { describe, expect, it } from "vitest";
import { buildCodeUsage, type UsageRow } from "./cbs-usage";

const granted: UsageRow[] = [
  { displayCode: "600-00-0000-00-0", name: "Piping" },
  { displayCode: "604-20-0000-00-0", name: "Third Party Rental" },
  { displayCode: "604-20-1000-00-L", name: "Crane Rental" },
  { displayCode: "604-20-2000-00-L", name: "Manlift Rental" },
  { displayCode: "101-05-0000-00-0", name: "Earthwork & Trenching" },
];

const usage = new Map([
  ["604-20-1000-00-L", 12],
  ["101-05-0000-00-0", 3],
]);

describe("buildCodeUsage", () => {
  it("separates granted from actually used, per division", () => {
    const { divisions } = buildCodeUsage(granted, usage);
    const six = divisions.find((d) => d.l1 === "604")!;
    expect(six).toMatchObject({ granted: 3, used: 1, rows: 12 });
    const one = divisions.find((d) => d.l1 === "101")!;
    expect(one).toMatchObject({ granted: 1, used: 1, rows: 3 });
  });

  it("puts the biggest pruning opportunity first", () => {
    // 604 grants three and uses one; the others waste nothing.
    const { divisions } = buildCodeUsage(granted, usage);
    expect(divisions[0].l1).toBe("604");
  });

  it("lists unused codes before used ones, since that is what gets revoked", () => {
    const { divisions } = buildCodeUsage(granted, usage);
    const six = divisions.find((d) => d.l1 === "604")!;
    expect(six.items.map((i) => i.rows)).toEqual([0, 0, 12]);
  });

  it("names a division from its summary row, whatever order it arrives in", () => {
    const { divisions } = buildCodeUsage(
      [
        { displayCode: "604-20-1000-00-L", name: "Crane Rental" },
        { displayCode: "604-00-0000-00-0", name: "Pipe Shop Equipment" },
      ],
      new Map(),
    );
    expect(divisions[0].name).toBe("Pipe Shop Equipment");
  });

  it("falls back to a granted code's name when the summary is not granted", () => {
    // An allow-list need not include the summary above the codes it grants.
    const { divisions } = buildCodeUsage(
      [{ displayCode: "604-20-1000-00-L", name: "Crane Rental" }],
      new Map(),
    );
    expect(divisions[0].name).toBe("Crane Rental");
  });

  it("attributes each division to the discipline that owns the block", () => {
    const { divisions } = buildCodeUsage(granted, usage);
    expect(divisions.find((d) => d.l1 === "101")!.discipline).toBe("civil");
    expect(divisions.find((d) => d.l1 === "604")!.discipline).toBe("piping");
  });

  it("separates a missing grant from a code the catalog never had", () => {
    // Both are "used but not granted", and conflating them is how this page
    // would lie: a real CBS code missing from the allow-list is a gap to fix,
    // while a take-off-built code (metallurgy, bore size, fabricate/erect in
    // the segments) was never a dictionary row and never could be granted.
    const catalog = new Set([
      ...granted.map((g) => g.displayCode),
      "233-10-0000-00-M",
    ]);
    const { ungranted, unknown, totals } = buildCodeUsage(
      granted,
      new Map([
        ...usage,
        ["233-10-0000-00-M", 7], // a real code, not granted here
        ["604-MB-ST00-00-C", 9], // built by the piping take-off
      ]),
      catalog,
    );
    expect(ungranted).toEqual([
      { displayCode: "233-10-0000-00-M", name: "", rows: 7 },
    ]);
    expect(unknown).toEqual([
      { displayCode: "604-MB-ST00-00-C", name: "", rows: 9 },
    ]);
    expect(totals).toMatchObject({ ungranted: 1, unknown: 1 });
  });

  it("treats everything unmatched as built when no catalog is supplied", () => {
    // The default keeps the function usable without a catalog lookup, and errs
    // towards "not a dictionary code" rather than inventing allow-list gaps.
    const { ungranted, unknown } = buildCodeUsage(
      granted,
      new Map([["999-00-0000-00-0", 7]]),
    );
    expect(ungranted).toEqual([]);
    expect(unknown).toHaveLength(1);
  });

  it("totals granted, used and rows across every division", () => {
    const { totals } = buildCodeUsage(granted, usage);
    expect(totals).toMatchObject({ granted: 5, used: 2, rows: 15 });
  });

  it("handles a project with nothing granted", () => {
    expect(buildCodeUsage([], new Map())).toMatchObject({
      divisions: [],
      totals: { granted: 0, used: 0, rows: 0, ungranted: 0 },
    });
  });
});

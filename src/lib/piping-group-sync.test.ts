import { describe, expect, it } from "vitest";
import {
  parsePipingCsvLine,
  parsePipingGroupCodes,
  planPipingGroupSync,
  type PipingGroupCodes,
  type PipingGroupRow,
} from "./piping-group-sync";

const HEADER =
  "Group No.,Material Classification,Metallurgy Code,Shop Code,Parent Code";

describe("parsePipingCsvLine", () => {
  it("splits on commas", () => {
    expect(parsePipingCsvLine("0,Carbon Steel,640,610,01")).toEqual([
      "0",
      "Carbon Steel",
      "640",
      "610",
      "01",
    ]);
  });

  it("keeps commas inside a quoted field", () => {
    // The real file quotes "Stainless Steel 304, 309, 310, 316 L & H Grades".
    expect(
      parsePipingCsvLine('0,"Stainless Steel 304, 309, 310",641,611'),
    ).toEqual(["0", "Stainless Steel 304, 309, 310", "641", "611"]);
  });

  it("unescapes a doubled quote", () => {
    expect(parsePipingCsvLine('0,"2"" pipe",641,611')[1]).toBe('2" pipe');
  });

  it("yields an empty field for consecutive commas and a trailing one", () => {
    expect(parsePipingCsvLine("a,,b,")).toEqual(["a", "", "b", ""]);
  });
});

describe("parsePipingGroupCodes", () => {
  it("maps each classification to its install and shop codes", () => {
    const csv = [
      HEADER,
      "0,Carbon Steel,640,610,01",
      "1,Copper,645,615,02",
    ].join("\n");
    expect([...parsePipingGroupCodes(csv)]).toEqual([
      ["Carbon Steel", { installCode: "640", shopCode: "610" }],
      ["Copper", { installCode: "645", shopCode: "615" }],
    ]);
  });

  it("takes the first row for a classification and ignores the rest", () => {
    // The file carries one row per (group, pipe size), so a classification
    // repeats hundreds of times with the same codes.
    const csv = [
      HEADER,
      "0,Carbon Steel,640,610,01",
      "0,Carbon Steel,640,610,01",
      "0,Carbon Steel,999,999,01",
    ].join("\n");
    expect(parsePipingGroupCodes(csv).get("Carbon Steel")).toEqual({
      installCode: "640",
      shopCode: "610",
    });
  });

  it("skips the header, blank lines and rows missing any of the three fields", () => {
    const csv = [
      HEADER,
      "",
      "0,,640,610",           // no classification
      "0,Brass,,616",         // no install code
      "0,Grooved,647,",       // no shop code
      "   ",
      "0,Aluminum,650,620",
    ].join("\n");
    expect([...parsePipingGroupCodes(csv).keys()]).toEqual(["Aluminum"]);
  });

  it("handles CRLF line endings and trims the cells", () => {
    const csv = `${HEADER}\r\n0, Carbon Steel , 640 , 610 \r\n`;
    expect(parsePipingGroupCodes(csv).get("Carbon Steel")).toEqual({
      installCode: "640",
      shopCode: "610",
    });
  });

  it("returns nothing for a header-only file", () => {
    expect(parsePipingGroupCodes(HEADER).size).toBe(0);
  });
});

const codes = (installCode: string, shopCode: string): PipingGroupCodes => ({
  installCode,
  shopCode,
});
const group = (
  id: number,
  materialClassification: string,
  installCode: string,
  shopCode: string,
): PipingGroupRow => ({ id, materialClassification, installCode, shopCode });

describe("planPipingGroupSync", () => {
  const wanted = new Map([
    ["Carbon Steel", codes("640", "610")],
    ["Copper", codes("645", "615")],
  ]);

  it("marks a row stale when either code differs, and carries the new pair", () => {
    const plan = planPipingGroupSync(wanted, [
      group(1, "Carbon Steel", "633", "603"),
    ]);
    expect(plan.stale).toEqual([{ id: 1, installCode: "640", shopCode: "610" }]);
    expect(plan.current).toBe(0);
  });

  it("counts a row already holding both codes as current", () => {
    const plan = planPipingGroupSync(wanted, [
      group(1, "Carbon Steel", "640", "610"),
    ]);
    expect(plan.stale).toEqual([]);
    expect(plan.current).toBe(1);
    expect(plan.changes).toEqual([]);
  });

  it("treats a half-stale row as stale", () => {
    // Shop code already moved, install code did not.
    const plan = planPipingGroupSync(wanted, [
      group(1, "Carbon Steel", "633", "610"),
    ]);
    expect(plan.stale).toEqual([{ id: 1, installCode: "640", shopCode: "610" }]);
  });

  it("reports a classification absent from the CSV without touching it", () => {
    const plan = planPipingGroupSync(wanted, [
      group(1, "Unobtainium", "900", "900"),
    ]);
    expect(plan.unknown).toEqual(["Unobtainium"]);
    expect(plan.stale).toEqual([]);
    expect(plan.current).toBe(0);
  });

  it("lists an unknown classification once however many rows carry it", () => {
    const plan = planPipingGroupSync(wanted, [
      group(1, "Unobtainium", "900", "900"),
      group(2, "Unobtainium", "900", "900"),
    ]);
    expect(plan.unknown).toEqual(["Unobtainium"]);
  });

  it("updates every stale row but describes the change once per classification", () => {
    // Hundreds of group rows share a classification and all move together;
    // the log should not repeat the same line for each.
    const plan = planPipingGroupSync(wanted, [
      group(1, "Carbon Steel", "633", "603"),
      group(2, "Carbon Steel", "633", "603"),
      group(3, "Copper", "638", "608"),
    ]);
    expect(plan.stale.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(plan.changes).toEqual([
      { classification: "Carbon Steel", description: "633/603 → 640/610" },
      { classification: "Copper", description: "638/608 → 645/615" },
    ]);
  });

  it("is a no-op plan when there are no groups", () => {
    expect(planPipingGroupSync(wanted, [])).toEqual({
      stale: [],
      current: 0,
      unknown: [],
      changes: [],
    });
  });
});

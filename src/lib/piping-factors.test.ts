import { describe, expect, it } from "vitest";
import {
  packPipingFactors,
  unpackPipingFactors,
  type PipingFactorLookup,
  type RawPipingFactor,
} from "./piping-factors";

/**
 * The catalog moved from "send everything, reduce on the client" to "reduce on
 * the server, send the survivors". That is only safe if the lookup the grid
 * ends up with is byte-for-byte the one it had before — a factor value that
 * changes silently reprices labor.
 *
 * `legacyLookup` below is the loop `PipingTable` ran before this change,
 * transcribed verbatim. Every test asserts the new pair agrees with it.
 */
function legacyLookup(rows: readonly RawPipingFactor[]): PipingFactorLookup {
  const m: PipingFactorLookup = new Map();
  for (const factor of rows) {
    let entry = m.get(factor.code);
    if (!entry) {
      entry = { unit: factor.unit, values: new Map<number, number>() };
      m.set(factor.code, entry);
    }
    for (const v of factor.values) {
      if (v.value !== null && !entry.values.has(v.size)) {
        entry.values.set(v.size, v.value);
      }
    }
  }
  return m;
}

const roundTrip = (rows: readonly RawPipingFactor[]) =>
  unpackPipingFactors(packPipingFactors(rows).pipingFactors);

/** Comparable plain form, so Maps compare by content rather than identity. */
const plain = (m: PipingFactorLookup) =>
  [...m]
    .map(([code, e]) => [code, e.unit, [...e.values].sort((a, b) => a[0] - b[0])])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe("packPipingFactors / unpackPipingFactors", () => {
  it("round-trips a plain catalog unchanged", () => {
    const rows: RawPipingFactor[] = [
      { code: "A", unit: "EA", taskDefinition: "Alpha", values: [{ size: 1, value: 1.5 }, { size: 2, value: 2.5 }] },
      { code: "B", unit: "LF", taskDefinition: "Beta", values: [{ size: 1, value: 9 }] },
    ];
    expect(plain(roundTrip(rows))).toEqual(plain(legacyLookup(rows)));
    expect(roundTrip(rows).get("A")!.values.get(2)).toBe(2.5);
  });

  it("drops null values, exactly as the client used to", () => {
    // 38.8% of real rows are null. They were transmitted, then discarded.
    const rows: RawPipingFactor[] = [
      {
        code: "A",
        unit: "EA",
        taskDefinition: "Alpha",
        values: [
          { size: 1, value: null },
          { size: 2, value: 4 },
          { size: 3, value: null },
        ],
      },
    ];
    const lookup = roundTrip(rows);
    expect(plain(lookup)).toEqual(plain(legacyLookup(rows)));
    expect(lookup.get("A")!.values.has(1)).toBe(false);
    expect([...lookup.get("A")!.values]).toEqual([[2, 4]]);
  });

  it("keeps the FIRST non-null value when a size repeats across rows", () => {
    // This is the FBWXXH case: two rows share a code with different curves.
    // Whichever sorts first wins — preserved from the old behavior on purpose.
    const rows: RawPipingFactor[] = [
      { code: "FBWXXH", unit: "EA", taskDefinition: "FIELD BUTTWELD Sch 5", values: [{ size: 12, value: 4.94 }] },
      { code: "FBWXXH", unit: "EA", taskDefinition: "FIELD BUTTWELD XXH", values: [{ size: 12, value: 18.2 }] },
    ];
    const lookup = roundTrip(rows);
    expect(plain(lookup)).toEqual(plain(legacyLookup(rows)));
    expect(lookup.get("FBWXXH")!.values.get(12)).toBe(4.94);
  });

  it("does not let a null in the first row mask a real value in the second", () => {
    // First-wins applies to the first NON-NULL, not the first row.
    const rows: RawPipingFactor[] = [
      { code: "A", unit: "EA", taskDefinition: "one", values: [{ size: 5, value: null }] },
      { code: "A", unit: "LF", taskDefinition: "two", values: [{ size: 5, value: 7 }] },
    ];
    const lookup = roundTrip(rows);
    expect(plain(lookup)).toEqual(plain(legacyLookup(rows)));
    expect(lookup.get("A")!.values.get(5)).toBe(7);
    // …but `unit` still comes from the first row carrying the code.
    expect(lookup.get("A")!.unit).toBe("EA");
  });

  it("takes taskDefinition and unit from the first row for a code", () => {
    const rows: RawPipingFactor[] = [
      { code: "A", unit: "EA", taskDefinition: "first", values: [] },
      { code: "A", unit: "LF", taskDefinition: "second", values: [] },
    ];
    const packed = packPipingFactors(rows);
    expect(packed.taskCodeOptions).toEqual([{ code: "A", taskDefinition: "first" }]);
    expect(packed.pipingFactors[0].unit).toBe("EA");
  });

  it("emits one entry per code, not one per row", () => {
    const rows: RawPipingFactor[] = [
      { code: "A", unit: "EA", taskDefinition: "x", values: [{ size: 1, value: 1 }] },
      { code: "A", unit: "EA", taskDefinition: "y", values: [{ size: 2, value: 2 }] },
      { code: "B", unit: "EA", taskDefinition: "z", values: [{ size: 1, value: 3 }] },
    ];
    const packed = packPipingFactors(rows);
    expect(packed.pipingFactors.map((f) => f.code)).toEqual(["A", "B"]);
    // Sizes from both A rows survive — merging, not dropping.
    expect(packed.pipingFactors[0].sv).toEqual([1, 1, 2, 2]);
  });

  it("packs values as flat size/value pairs", () => {
    const packed = packPipingFactors([
      { code: "A", unit: "EA", taskDefinition: "x", values: [{ size: 0.5, value: 1.1 }, { size: 12, value: 4.9 }] },
    ]);
    expect(packed.pipingFactors[0].sv).toEqual([0.5, 1.1, 12, 4.9]);
  });

  it("handles an empty catalog and a code with no usable values", () => {
    expect(packPipingFactors([]).pipingFactors).toEqual([]);
    expect(unpackPipingFactors([]).size).toBe(0);
    expect(unpackPipingFactors(undefined).size).toBe(0);

    const allNull: RawPipingFactor[] = [
      { code: "A", unit: "EA", taskDefinition: "x", values: [{ size: 1, value: null }] },
    ];
    // The code still exists (it is selectable); it just prices nothing.
    expect(roundTrip(allNull).get("A")).toEqual({ unit: "EA", values: new Map() });
    expect(plain(roundTrip(allNull))).toEqual(plain(legacyLookup(allNull)));
  });

  it("ignores a malformed odd-length payload rather than storing undefined", () => {
    const lookup = unpackPipingFactors([{ code: "A", unit: "EA", sv: [1, 2, 3] }]);
    expect([...lookup.get("A")!.values]).toEqual([[1, 2]]);
  });

  it("agrees with the legacy loop across a mixed catalog", () => {
    const rows: RawPipingFactor[] = [
      { code: "A", unit: "EA", taskDefinition: "a1", values: [{ size: 1, value: null }, { size: 2, value: 2 }] },
      { code: "B", unit: "LF", taskDefinition: "b1", values: [{ size: 1, value: 5 }, { size: 1, value: 6 }] },
      { code: "A", unit: "XX", taskDefinition: "a2", values: [{ size: 1, value: 10 }, { size: 2, value: 99 }] },
      { code: "C", unit: "EA", taskDefinition: "c1", values: [] },
    ];
    expect(plain(roundTrip(rows))).toEqual(plain(legacyLookup(rows)));
  });
});

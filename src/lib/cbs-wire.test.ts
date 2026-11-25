import { describe, expect, it } from "vitest";
import { packCbsRows, unpackCbsRows, type CbsPackableRow } from "./cbs/wire";

const row = (
  id: number,
  over: Partial<CbsPackableRow> = {},
): CbsPackableRow => ({
  id,
  displayCode: `601-00-0000-00-${id}`,
  name: "Pipe",
  uom: "LF",
  accountDescription: "",
  subReporting: null,
  materialCode: true,
  laborCode: false,
  equipmentCode: null,
  otherCode: true,
  rentalCode: false,
  status: "Active",
  costClassification: null,
  materialType: null,
  discipline: "60 - Piping",
  isOriginal: true,
  ...over,
});

describe("packCbsRows / unpackCbsRows", () => {
  it("gives back exactly what went in", () => {
    const rows = [
      row(1),
      // Null, blank and repeated texts stay apart; so do null and false.
      row(9, { status: null, uom: "", isOriginal: null }),
      row(4, { status: "", name: 'Say "pipe" — ½', isOriginal: false }),
    ];
    expect(unpackCbsRows(packCbsRows(rows))).toStrictEqual(rows);
    expect(unpackCbsRows(packCbsRows([]))).toEqual([]);
  });

  it("carries every combination of the flags", () => {
    const states = [null, true, false];
    const rows = Array.from({ length: 3 ** 7 }, (_, n) => {
      const at = (i: number) => states[Math.floor(n / 3 ** i) % 3];
      return row(n + 1, {
        subReporting: at(0),
        materialCode: at(1),
        laborCode: at(2),
        equipmentCode: at(3),
        otherCode: at(4),
        rentalCode: at(5),
        isOriginal: at(6),
      });
    });
    expect(unpackCbsRows(packCbsRows(rows))).toStrictEqual(rows);
  });

  it("sends a repeated text once", () => {
    const packed = packCbsRows(Array.from({ length: 50 }, (_, i) => row(i)));
    expect(packed.match(/60 - Piping/g)).toHaveLength(1);
  });
});

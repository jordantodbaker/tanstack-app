import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { HealthCheck } from "~/lib/cbs-health";
import {
  buildHealthCheckWorkbook,
  healthCheckFilename,
} from "./cbs-health-xlsx.server";

/**
 * Round-trips the workbook: build it, read the bytes back, and assert what a
 * person opening the file would see. Asserting on the inputs would prove
 * nothing — the text format on the code column and the filter range are Excel
 * semantics that only exist once written.
 */

const CHECK: HealthCheck = {
  id: "qc-l3-cost-type",
  title: "Roll-up rows with a cost type",
  severity: "error",
  count: 2,
  summary: "A roll-up level must carry cost type 0.",
  action: "Set the cost type to 0 in CBS.xlsx.",
  findings: [
    {
      code: "052-00-0000-00-L",
      name: "Field Staff",
      detail: "cost type L, expected 0",
      masterRow: 41,
    },
    {
      code: "091-00-0000-00-M",
      name: "Demolition Materials",
      detail: "cost type M, expected 0",
      masterRow: 57,
    },
  ],
};

async function roundTrip(check = CHECK) {
  const buffer = await buildHealthCheckWorkbook(check, "2026-10-15T09:00:00Z");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return { buffer, ws: wb.worksheets[0] };
}

describe("buildHealthCheckWorkbook", () => {
  it("produces a loadable xlsx named for the check", async () => {
    const { buffer, ws } = await roundTrip();
    expect([buffer[0], buffer[1]]).toEqual([0x50, 0x4b]); // "PK" — a zip
    expect(ws.name).toBe("Roll-up rows with a cost type");
  });

  it("carries the check's own explanation into the file", async () => {
    // These get forwarded; the file has to say what it is without the page.
    const { ws } = await roundTrip();
    expect(ws.getRow(1).getCell(1).value).toBe("Roll-up rows with a cost type");
    expect(ws.getRow(4).getCell(2).value).toContain("must carry cost type 0");
    expect(ws.getRow(5).getCell(2).value).toContain("Set the cost type to 0");
  });

  it("writes every finding under a header, not a sample", async () => {
    const { ws } = await roundTrip();
    expect([1, 2, 3, 4].map((c) => ws.getRow(6).getCell(c).value)).toEqual([
      "Row",
      "Display Code",
      "Name",
      "Issue",
    ]);
    expect(ws.getRow(7).getCell(2).value).toBe("052-00-0000-00-L");
    expect(ws.getRow(8).getCell(4).value).toBe("cost type M, expected 0");
  });

  it("writes the master row as a number so Excel sorts it as one", async () => {
    // This column is the point of the file: it is worked down in the
    // spreadsheet, so it has to sort numerically rather than as text.
    const { ws } = await roundTrip();
    expect(ws.getRow(7).getCell(1).value).toBe(41);
    expect(typeof ws.getRow(7).getCell(1).value).toBe("number");
  });

  it("leaves the master row blank when the finding has none", async () => {
    // A Core value that resolves to nothing is not a catalog row.
    const { ws } = await roundTrip({
      ...CHECK,
      findings: [{ code: "03000000000I", name: "", detail: "no such account" }],
    });
    expect(ws.getRow(7).getCell(1).value).toBeNull();
    expect(ws.getRow(7).getCell(2).value).toBe("03000000000I");
  });

  it("keeps the display code as text so Excel cannot eat a leading zero", async () => {
    const { ws } = await roundTrip();
    expect(ws.getRow(7).getCell(2).numFmt).toBe("@");
  });

  it("puts a filter over the findings and freezes the header", async () => {
    const { ws } = await roundTrip();
    expect(ws.autoFilter).toBe("A6:D8");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
  });

  it("writes a header-only sheet when a check has no findings", async () => {
    // A clean check can still be exported; it must open rather than corrupt.
    const { ws } = await roundTrip({ ...CHECK, count: 0, findings: [] });
    expect(ws.getRow(6).getCell(1).value).toBe("Row");
    expect(ws.getRow(7).actualCellCount).toBe(0);
  });

  it("sanitises a title Excel would refuse as a sheet name", async () => {
    // Excel rejects \ / ? * [ ] and caps the name at 31 characters.
    const { ws } = await roundTrip({
      ...CHECK,
      title: "Codes with a / or [bracket] in a very long title indeed",
    });
    expect(ws.name.length).toBeLessThanOrEqual(31);
    expect(ws.name).not.toMatch(/[\\/?*[\]]/);
  });
});

describe("healthCheckFilename", () => {
  it("names the file for the check and the day it was run", () => {
    expect(healthCheckFilename(CHECK, "2026-10-15T09:00:00Z")).toBe(
      "cbs-health-roll-up-rows-with-a-cost-type-2026-10-15.xlsx",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `fetchProjectFefRowTotals` reads only the columns the sums need and takes
 * the invalid counts from the narrow SQL-filtered query, rather than loading
 * every column of every row. Prisma is faked so these assert on what is asked
 * of the database as well as what comes back.
 */
const { findMany, requireVersionAccess } = vi.hoisted(() => ({
  findMany: vi.fn(),
  requireVersionAccess: vi.fn(),
}));
vi.mock("../server/db", () => ({ prisma: { fefRow: { findMany } } }));
vi.mock("./users.server", () => ({ requireVersionAccess }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const builder = {
      inputValidator(v: (d: unknown) => unknown) {
        validate = v;
        return builder;
      },
      handler(h: (args: { data: unknown }) => unknown) {
        return async (args?: { data: unknown }) =>
          h({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

import { fetchProjectFefRowTotals } from "./projectTotals";

const row = (over: Record<string, string | null>) => ({
  discipline: "piping",
  section: "TAKE_OFF",
  cbsCode: "601-05-0000-00-L",
  area: "",
  quantity: "2",
  laborHours: "10",
  laborRate: "100",
  materialCost: "",
  ...over,
});

/** The two reads, told apart by whether they filter on "touched" rows. */
const isInvalidQuery = (args: { where: { OR?: unknown } }) =>
  args.where.OR !== undefined;

beforeEach(() => {
  vi.clearAllMocks();
  requireVersionAccess.mockResolvedValue({ projectId: 1 });
});

describe("fetchProjectFefRowTotals", () => {
  it("reads only the bucketing keys and the four numbers for the sums", async () => {
    findMany.mockResolvedValue([]);
    await fetchProjectFefRowTotals({ data: 4 });
    const sums = findMany.mock.calls.find(([a]) => !isInvalidQuery(a))![0];
    expect(Object.keys(sums.select).sort()).toEqual([
      "area",
      "cbsCode",
      "discipline",
      "laborHours",
      "laborRate",
      "materialCost",
      "quantity",
      "section",
    ]);
    expect(sums.where).toEqual({ versionId: 4 });
  });

  it("takes invalid counts from the narrow query, not the slim rows", async () => {
    findMany.mockImplementation(async (args) =>
      isInvalidQuery(args)
        ? // Started but no hours: invalid.
          [{ discipline: "civil", laborHours: "", laborRate: "90" }]
        : [row({}), row({ discipline: "civil", laborHours: "" })],
    );
    const totals = await fetchProjectFefRowTotals({ data: 4 });
    expect(totals.invalidByDiscipline).toEqual({ civil: 1 });
    // The sums still come from the slim rows: 10 h × 100 on the piping line.
    expect(totals.laborByDigit).toEqual({ "6": 1000 });
  });

  it("runs both reads at once", async () => {
    let inFlight = 0;
    let peak = 0;
    findMany.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return [];
    });
    await fetchProjectFefRowTotals({ data: 4 });
    expect(peak).toBe(2);
  });

  it("checks version access before reading", async () => {
    requireVersionAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(fetchProjectFefRowTotals({ data: 4 })).rejects.toThrow(
      "Forbidden",
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});

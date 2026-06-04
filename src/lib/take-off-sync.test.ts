import { describe, expect, it } from "vitest";
import { aggregateTakeOff } from "./take-off-sync";
import type { FefRow } from "./types";

function row(overrides: Partial<FefRow>): FefRow {
  return {
    id: "0",
    name: "",
    description: "",
    shopField: "",
    weldGroupDescription: "",
    quantity: "",
    size: "",
    unit: "",
    metallurgyCode: "",
    boreSize: "",
    role: "",
    crewMixId: "",
    schedule: "",
    taskCode: "",
    laborHours: "",
    laborFactor: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
    sub: "",
    area: "",
    ...overrides,
  };
}

describe("aggregateTakeOff", () => {
  it("returns an empty array when given no rows", () => {
    expect(aggregateTakeOff([])).toEqual([]);
  });

  it("drops rows whose quantity is not positive", () => {
    const result = aggregateTakeOff([
      row({ id: "601-01", quantity: "0", laborHours: "5", laborRate: "50" }),
      row({ id: "601-02", quantity: "", laborHours: "3", laborRate: "60" }),
      row({ id: "601-03", quantity: "abc", laborHours: "2", laborRate: "60" }),
      row({ id: "601-04", quantity: "-2", laborHours: "1", laborRate: "60" }),
    ]);
    expect(result).toEqual([]);
  });

  it("keeps a single qualifying row but rewrites its labor rate field", () => {
    const result = aggregateTakeOff([
      row({
        id: "601-01",
        name: "Pipe Fab",
        quantity: "10",
        laborHours: "4",
        laborRate: "50",
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("601-01");
    expect(result[0].name).toBe("Pipe Fab");
    expect(result[0].quantity).toBe("10");
    expect(result[0].laborHours).toBe("4");
    // single row, rate stays the same
    expect(parseFloat(result[0].laborRate)).toBeCloseTo(50, 6);
  });

  it("groups rows by id and sums quantity and hours", () => {
    const result = aggregateTakeOff([
      row({ id: "601-01", quantity: "10", laborHours: "4", laborRate: "50" }),
      row({ id: "601-01", quantity: "5", laborHours: "2", laborRate: "75" }),
      row({ id: "601-02", quantity: "3", laborHours: "1", laborRate: "100" }),
    ]);
    expect(result).toHaveLength(2);
    const byId = Object.fromEntries(result.map((r) => [r.id, r]));
    expect(byId["601-01"].quantity).toBe("15");
    expect(byId["601-01"].laborHours).toBe("6");
    expect(byId["601-02"].quantity).toBe("3");
    expect(byId["601-02"].laborHours).toBe("1");
  });

  it("computes a weighted-average labor rate by total cost / total hours", () => {
    const result = aggregateTakeOff([
      row({ id: "601-01", quantity: "10", laborHours: "4", laborRate: "50" }),
      row({ id: "601-01", quantity: "5", laborHours: "2", laborRate: "100" }),
    ]);
    // cost = 4*50 + 2*100 = 400; hours = 6; rate = 400/6 = 66.666...
    expect(parseFloat(result[0].laborRate)).toBeCloseTo(400 / 6, 6);
  });

  it("emits an empty labor rate when aggregated hours are zero", () => {
    const result = aggregateTakeOff([
      row({ id: "601-01", quantity: "10", laborHours: "0", laborRate: "50" }),
    ]);
    // quantity > 0 so the row is kept, but hours = 0 means no defined rate.
    expect(result).toHaveLength(1);
    expect(result[0].laborRate).toBe("");
  });

  it("uses the first encountered row as the base for non-aggregated fields", () => {
    const result = aggregateTakeOff([
      row({ id: "601-01", quantity: "10", laborHours: "4", laborRate: "50", name: "first", notes: "first-notes" }),
      row({ id: "601-01", quantity: "5", laborHours: "2", laborRate: "75", name: "second", notes: "second-notes" }),
    ]);
    expect(result[0].name).toBe("first");
    expect(result[0].notes).toBe("first-notes");
  });

  it("treats unparseable labor hours/rate as 0 when accumulating cost", () => {
    const result = aggregateTakeOff([
      row({ id: "601-01", quantity: "1", laborHours: "abc", laborRate: "abc" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].laborHours).toBe("0");
    expect(result[0].laborRate).toBe("");
  });
});

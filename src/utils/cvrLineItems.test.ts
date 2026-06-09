import { describe, expect, it } from "vitest";
import {
  lineItemTotal,
  makeBlankLineItem,
  sumLineItems,
  type CvrLineItemDto,
} from "./cvrLineItems";

function line(partial: Partial<CvrLineItemDto> = {}): CvrLineItemDto {
  return { ...makeBlankLineItem(0), ...partial };
}

describe("cvr line item math", () => {
  it("computes a line total as quantity × unitRate", () => {
    expect(lineItemTotal({ quantity: 120, unitRate: 85 })).toBe(10200);
  });

  it("treats a negative rate/quantity as a credit", () => {
    expect(lineItemTotal({ quantity: 1, unitRate: -500 })).toBe(-500);
    expect(lineItemTotal({ quantity: -2, unitRate: 100 })).toBe(-200);
  });

  it("sums multiple lines", () => {
    const total = sumLineItems([
      line({ quantity: 120, unitRate: 85 }), // 10,200
      line({ quantity: 1, unitRate: 3400 }), // 3,400
      line({ quantity: 1, unitRate: -1000 }), // -1,000 credit
    ]);
    expect(total).toBe(12600);
  });

  it("sums an empty buildup to zero", () => {
    expect(sumLineItems([])).toBe(0);
  });

  it("makeBlankLineItem starts at zero on the LABOR type", () => {
    const li = makeBlankLineItem(3);
    expect(li).toMatchObject({
      position: 3,
      costType: "LABOR",
      quantity: 0,
      unitRate: 0,
    });
    expect(lineItemTotal(li)).toBe(0);
  });
});

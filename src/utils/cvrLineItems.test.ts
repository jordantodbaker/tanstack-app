import { describe, expect, it } from "vitest";
import {
  buildupCbsCodes,
  lineItemTotal,
  makeBlankLineItem,
  mergeAffectedCbsCodes,
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

  it("buildupCbsCodes returns distinct non-empty codes in first-seen order", () => {
    const codes = buildupCbsCodes([
      line({ cbsCode: "07-100" }),
      line({ cbsCode: "" }),
      line({ cbsCode: "03-200" }),
      line({ cbsCode: "07-100" }),
    ]);
    expect(codes).toEqual(["07-100", "03-200"]);
  });

  it("mergeAffectedCbsCodes adds buildup codes without removing existing ones", () => {
    const merged = mergeAffectedCbsCodes(
      ["09-500"],
      [line({ cbsCode: "07-100" }), line({ cbsCode: "09-500" })],
    );
    // existing kept first, only the genuinely-new code appended once
    expect(merged).toEqual(["09-500", "07-100"]);
  });

  it("mergeAffectedCbsCodes is a no-op when every buildup code is already present", () => {
    const existing = ["07-100", "09-500"];
    const merged = mergeAffectedCbsCodes(existing, [line({ cbsCode: "07-100" })]);
    expect(merged).toEqual(existing);
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

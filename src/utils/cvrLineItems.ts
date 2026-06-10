/**
 * Pure helpers for the CVR cost buildup. Kept free of React / Prisma so the
 * math is unit-testable and shared between the dialog editor, the upsert
 * handler (server-authoritative roll-up), and the print view.
 *
 * v1 has no markup: a line's total is simply `quantity × unitRate`, and a
 * CVR's `costImpact` is the sum of its line totals. Markup lands later in the
 * shared FEF indirect-cost stack.
 */

export const CVR_COST_TYPES = [
  "LABOR",
  "MATERIAL",
  "EQUIPMENT",
  "SUBCONTRACT",
  "OTHER",
] as const;
export type CvrCostType = (typeof CVR_COST_TYPES)[number];

export const CVR_COST_TYPE_LABELS: Record<CvrCostType, string> = {
  LABOR: "Labor",
  MATERIAL: "Material",
  EQUIPMENT: "Equipment",
  SUBCONTRACT: "Subcontract",
  OTHER: "Other",
};

/**
 * Client/serialized shape of a CVR cost-buildup line. `id` is present for
 * persisted rows and absent for newly-added ones (the upsert recreates all
 * lines, so the id only matters for React keys on the client).
 */
export type CvrLineItemDto = {
  id?: number;
  position: number;
  description: string;
  /** Optional CBS item this line rolls up to — a CbsItem.displayCode, or "". */
  cbsCode: string;
  costType: CvrCostType;
  quantity: number;
  unit: string;
  unitRate: number;
  notes: string;
};

/** Line total — `quantity × unitRate`. Negative rates/quantities yield a
 *  credit, which is intentional (a CVR can reduce cost). */
export function lineItemTotal(li: Pick<CvrLineItemDto, "quantity" | "unitRate">): number {
  return li.quantity * li.unitRate;
}

/** Sum of every line's total — the CVR's derived `costImpact`. */
export function sumLineItems(
  items: ReadonlyArray<Pick<CvrLineItemDto, "quantity" | "unitRate">>,
): number {
  return items.reduce((acc, li) => acc + lineItemTotal(li), 0);
}

/** Distinct, non-empty CBS codes used across the buildup lines, in first-seen
 *  order. These are the codes the change is provably spending against. */
export function buildupCbsCodes(
  items: ReadonlyArray<Pick<CvrLineItemDto, "cbsCode">>,
): string[] {
  return [
    ...new Set(items.map((li) => li.cbsCode).filter((c) => c !== "")),
  ];
}

/**
 * Union the CVR's Affected CBS codes with the codes used in its cost buildup.
 * Additive and order-preserving (existing codes first, then any new buildup
 * codes) — a costed CBS code is by definition "affected", but Affected may also
 * carry codes with no cost line, so this never removes anything. Returns a new
 * array only when there's something to add.
 */
export function mergeAffectedCbsCodes(
  existing: ReadonlyArray<string>,
  items: ReadonlyArray<Pick<CvrLineItemDto, "cbsCode">>,
): string[] {
  const have = new Set(existing);
  const additions = buildupCbsCodes(items).filter((c) => !have.has(c));
  return additions.length === 0
    ? [...existing]
    : [...existing, ...additions];
}

/** A blank line at the given position, defaulting to the LABOR cost type. */
export function makeBlankLineItem(position: number): CvrLineItemDto {
  return {
    position,
    description: "",
    cbsCode: "",
    costType: "LABOR",
    quantity: 0,
    unit: "",
    unitRate: 0,
    notes: "",
  };
}

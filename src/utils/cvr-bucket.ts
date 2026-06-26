import {
  DIGIT_TO_DISCIPLINE,
  L1_TO_DISCIPLINE,
  disciplineL1Codes,
} from "~/config/disciplines-data";

const DISCIPLINE_IDS = new Set(Object.keys(disciplineL1Codes));

/**
 * Pure bucket-attribution for a single CVR / Trend. Used by EVM to roll an
 * approved/executed CVR's cost (or a trend's forecast) into the matching
 * **discipline** bucket. Lives in its own module (not `reporting.ts`) so tests
 * can import it without dragging in Prisma.
 *
 * Resolution priority:
 *   1. The parent CBS (L1) code of `cbsCodes[0]` → its discipline. Using L1
 *      (not the leading digit) is what lets Grout (29X) attribute to "grout"
 *      rather than "concrete", though both are digit 2.
 *   2. The record's `discipline` field when it's a known discipline id (it
 *      already is for CVR/Trend).
 *   3. `null` when neither resolves — the caller skips the row rather than
 *      mis-attributing it.
 */
export function resolveCvrBucket(input: {
  cbsCodes: string[];
  discipline: string;
}): string | null {
  const first = input.cbsCodes[0];
  if (first && first.length >= 3) {
    const disc = L1_TO_DISCIPLINE[first.slice(0, 3)];
    if (disc) return disc;
  }
  if (input.discipline && DISCIPLINE_IDS.has(input.discipline)) {
    return input.discipline;
  }
  return null;
}

/** One CVR cost-buildup line — the subset needed to attribute its cost. */
export type CvrCostLine = {
  cbsCode: string;
  quantity: number;
  unitRate: number;
};

/** L1 (3-char parent CBS) for a display code; "" when too short to carry one
 *  (unattributed). Matches the `*ByL1` key scheme in `ProjectFefRowTotals`. */
function l1Of(code: string): string {
  return code.length >= 3 ? code.slice(0, 3) : "";
}

/**
 * Attribute a CVR's cost to **L1** buckets — the finest grain the Field
 * Estimate exposes (`ProjectFefRowTotals.*ByL1`), so an approved CVR can be
 * reconciled against the estimate per account, not just per discipline.
 *
 * When the CVR has a cost buildup, each line is attributed to its own
 * `cbsCode`'s L1 (line total = `quantity × unitRate`, the same formula the
 * server uses to derive `costImpact` from lines — so the attributed sum
 * reconciles with `costImpact`). Otherwise the whole `costImpact` lands on the
 * first affected code's L1. Cost whose code is blank/short lands under the ""
 * (unattributed) key so it's never silently dropped.
 */
export function attributeCvrCostByL1(cvr: {
  cbsCodes: string[];
  costImpact: number;
  lineItems?: CvrCostLine[];
}): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (code: string, amount: number) => {
    if (amount === 0) return;
    const key = l1Of(code);
    out[key] = (out[key] ?? 0) + amount;
  };
  if (cvr.lineItems && cvr.lineItems.length > 0) {
    for (const li of cvr.lineItems) add(li.cbsCode, li.quantity * li.unitRate);
    return out;
  }
  add(cvr.cbsCodes[0] ?? "", cvr.costImpact);
  return out;
}

/** The discipline that owns an L1 (3-char parent CBS): its explicit mapping,
 *  else the leading digit's canonical discipline, else "" (unattributed). The
 *  single-L1 form of the `bacByDiscipline` attribution — shared so the UI
 *  groups L1 rows under exactly the disciplines the server rolled them into. */
export function disciplineForL1(l1: string): string {
  return (
    L1_TO_DISCIPLINE[l1] ?? (l1 ? DIGIT_TO_DISCIPLINE[l1[0]] : undefined) ?? ""
  );
}

/**
 * Roll an L1-keyed money map up to discipline buckets. The "" (unattributed)
 * key and any L1 with no mapping stay under "" so cost is never dropped —
 * letting the caller surface it as an explicit row.
 */
export function rollUpL1ToDiscipline(
  byL1: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [l1, amount] of Object.entries(byL1)) {
    if (amount === 0) continue;
    const disc = disciplineForL1(l1);
    out[disc] = (out[disc] ?? 0) + amount;
  }
  return out;
}

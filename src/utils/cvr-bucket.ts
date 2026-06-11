import { L1_TO_DISCIPLINE, disciplineL1Codes } from "~/config/disciplines-data";

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

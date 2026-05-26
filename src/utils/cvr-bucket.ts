import { DISCIPLINE_TO_DIGIT } from "~/lib/project-totals";

/**
 * Pure bucket-attribution for a single CVR. Used by EVM to roll an
 * approved/executed CVR's cost into the matching digit bucket. Lives in
 * its own module (not `reporting.ts`) so tests can import it without
 * dragging in Prisma.
 *
 * Resolution priority, matching the FEF aggregator's philosophy:
 *   1. First character of `cbsCodes[0]` when present and non-empty.
 *   2. `DISCIPLINE_TO_DIGIT[discipline]` mapping when `cbsCodes` doesn't
 *      yield a usable first character.
 *   3. `null` when neither resolves — the caller skips the revision rather
 *      than mis-attributing it to a default bucket.
 *
 * Generic over the input shape so any record with `{ cbsCodes, discipline }`
 * can use it; tests pass plain objects.
 */
export function resolveCvrBucket(input: {
  cbsCodes: string[];
  discipline: string;
}): string | null {
  const first = input.cbsCodes[0];
  if (first && first.length > 0) return first[0];
  const fromDiscipline = DISCIPLINE_TO_DIGIT[input.discipline];
  if (fromDiscipline) return fromDiscipline;
  return null;
}

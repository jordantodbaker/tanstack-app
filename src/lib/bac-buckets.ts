import type { ProjectFefRowTotals } from "~/utils/projectTotals";

/**
 * Aggregate a snapshot's L1 buckets (labor + materials) into `Record<key,
 * amount>`, where `keyOf` maps each L1 (3-char parent CBS) to its output
 * bucket. Zero amounts are skipped; returning `undefined` from `keyOf` drops
 * that L1's cost (the discipline scheme uses this for L1s with no owning
 * discipline). Shared by reporting's `bacByDiscipline` and `bacByL1`.
 *
 * Lives in this client-safe module (not `reporting.ts`) so it can be exported
 * for unit tests without dragging the reporting module's prisma imports into
 * the client bundle.
 */
export function bacByBucket(
  totals: ProjectFefRowTotals,
  keyOf: (l1: string) => string | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (l1: string, amount: number) => {
    if (amount === 0) return;
    const key = keyOf(l1);
    if (key === undefined) return;
    out[key] = (out[key] ?? 0) + amount;
  };
  for (const [l1, v] of Object.entries(totals.laborByL1)) add(l1, v);
  for (const [l1, v] of Object.entries(totals.materialsByL1)) add(l1, v);
  return out;
}

/**
 * Pure derivation helpers for the Piping take-off: the (task code, size) →
 * labor-factor lookup and the metallurgy/bore → CBS-item match.
 *
 * Lives in `lib` (no React, no DOM) so both the cell editors
 * (`components/Piping/cells.tsx`) and the range operations (`grid-range.ts`)
 * derive the same fields from the same code — a fill-down or paste into Size /
 * Task Code has to mirror exactly what typing into the cell would have written.
 */
import type { CbsOption, FefRow } from "./types";

export type PipingFactorLookup = Map<
  string,
  { unit: string; values: Map<number, number> }
>;

/** The hours-per-unit factor for a row's (task code, size) pair, or undefined
 *  when either input is missing or the pair isn't in the factor table. */
export function laborFactorFor(
  row: Pick<FefRow, "taskCode" | "size">,
  lookup: PipingFactorLookup | undefined,
): number | undefined {
  if (!lookup || !row.taskCode || row.size === "") return undefined;
  const size = parseFloat(row.size);
  if (isNaN(size)) return undefined;
  return lookup.get(row.taskCode)?.values.get(size);
}

/**
 * Derives the labor-hours string a Take Off row should hold given its
 * current `taskCode`, `size`, and `quantity`. Returns `""` when the inputs
 * can't produce a value (missing factor, blank quantity, non-numeric qty).
 *
 * Derivation fires on the same event that changes one of those three fields —
 * the previous "compute on view, write via useEffect" pattern in
 * `LaborHoursCell` was issuing a debounced save for every loaded row whose
 * stored value didn't bit-match the recomputed one, so just opening the take-off
 * triggered a fan-out of saves.
 */
export function deriveLaborHours(
  row: Pick<FefRow, "taskCode" | "size" | "quantity">,
  lookup: PipingFactorLookup | undefined,
): string {
  const factor = laborFactorFor(row, lookup);
  const qty = parseFloat(row.quantity);
  if (factor === undefined || isNaN(qty) || row.quantity === "") return "";
  return (factor * qty).toFixed(1);
}

/** The CBS cost code a piping row composes from its metallurgy code + bore
 *  size, or null when either input is blank. Exposed so callers that hold an
 *  index of the catalog can look the code up themselves instead of scanning. */
export function pipingCostCode(
  metallurgyCode: string,
  boreSize: string,
): string | null {
  if (!metallurgyCode || !boreSize) return null;
  return `${metallurgyCode}${boreSize}ST0000C`;
}

/** The CBS item a piping row resolves to from its metallurgy code + bore size.
 *  Scans `cbsOptions` — fine for the cell editors, which resolve one row per
 *  edit. Bulk callers should compose with `pipingCostCode` and use their own
 *  index (see `grid-range.ts`). */
export function lookupCbsItem(
  metallurgyCode: string,
  boreSize: string,
  cbsOptions: CbsOption[],
): CbsOption | undefined {
  const code = pipingCostCode(metallurgyCode, boreSize);
  if (code === null) return undefined;
  return cbsOptions.find((o) => o.costCode === code);
}

/**
 * Pure derivation helpers for the Piping take-off: the (task code, size) →
 * labor-factor lookup and the metallurgy/bore → CBS-item match.
 *
 * Lives in `lib` (no React, no DOM) so both the cell editors
 * (`components/Piping/cells.tsx`) and the range operations (`grid-range.ts`)
 * derive the same fields from the same code — a fill-down or paste into Size /
 * Task Code has to mirror exactly what typing into the cell would have written.
 */
import type { FefRow } from "./types";

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

/**
 * The CBS cost codes a piping row could resolve to for its metallurgy code +
 * bore size, most specific first, so a caller taking the first available match
 * lands on the closest parent of what the row actually selected.
 *
 * Bore level — three shapes, because the catalog uses three, and every
 * (metallurgy, bore) pair in it matches exactly one:
 *
 *   {m}{bore}ST0000C      the Standard bore rollup. Every shop code except
 *                         Grooved: `603-MB-ST00-00-C`, "Shop Fab Carbon Steel
 *                         Medium Bore Standard". No install code has this shape.
 *   {m}{bore}0000{bore}C  the install bore rollup for 633–637, which repeats the
 *                         bore in the last segment: `633-MB-0000-MB-C`,
 *                         "Install Carbon Steel Medium Bore".
 *   {m}{bore}000000C      the plain bore rollup. Install codes 638–643 and shop
 *                         Grooved: `638-MB-0000-00-C`, "Install Copper Medium
 *                         Bore".
 *
 * Metallurgy level — the parent of all of those:
 *
 *   {m}00000000C          `633-00-0000-00-C`, "Install Carbon Steel".
 *
 * The parent is not redundant: callers resolve against the *project's* enabled
 * CBS items, not the whole catalog, so a project whose scope stops at the
 * metallurgy level has no bore-level code to hit. Falling back gives the row a
 * correct-but-broader item instead of nothing at all.
 *
 * Ordered rather than branched on Shop/Field. The shapes don't overlap within a
 * metallurgy code, so first-match is unambiguous, and a shop row still resolves
 * to exactly what it resolved to before this list existed — the install shapes
 * simply never matched, which is why Field rows used to resolve to nothing.
 *
 * Both inputs are required even though the last candidate ignores the bore: a
 * row with no size yet hasn't finished selecting anything, and stamping the
 * metallurgy rollup onto it would overwrite a Name the estimator picked by hand.
 */
export function pipingCostCodes(
  metallurgyCode: string,
  boreSize: string,
): string[] {
  if (!metallurgyCode || !boreSize) return [];
  return [
    `${metallurgyCode}${boreSize}ST0000C`,
    `${metallurgyCode}${boreSize}0000${boreSize}C`,
    `${metallurgyCode}${boreSize}000000C`,
    `${metallurgyCode}00000000C`,
  ];
}

/** The row fields a resolved CBS item stamps onto a piping row. */
export type CbsStamp = { id: string; name: string; unit: string };

/** Anything the caller can resolve a cost code to — `CbsOption` and the
 *  grid-range write index's entries both satisfy this. */
type CbsStampSource = { displayCode: string; name: string; uom: string };

/** What a row carries once a lookup ran and matched nothing. */
const CLEARED_CBS_STAMP: CbsStamp = { id: "", name: "", unit: "" };

/**
 * The id/name/unit a piping row should carry for a (metallurgy code, bore
 * size) pair. `find` resolves a composed cost code against the caller's own
 * catalog — an array scan in the cell editors, a Map in `grid-range`.
 *
 * The two misses are not the same thing:
 *
 * - `undefined` — nothing was attempted, because one of the inputs is still
 *   blank. The row keeps whatever it has; that may be a Name the estimator
 *   picked by hand, and a half-filled row must not clobber it.
 * - the cleared stamp — a lookup *did* run and found nothing. The row drops
 *   its item, because keeping it would leave the sheet asserting a CBS code
 *   that contradicts the inputs displayed beside it (a Field row still
 *   showing a "Shop Fab …" item, say), and that then saves as real data.
 */
export function resolveCbsStamp(
  metallurgyCode: string,
  boreSize: string,
  find: (costCode: string) => CbsStampSource | undefined,
): CbsStamp | undefined {
  const codes = pipingCostCodes(metallurgyCode, boreSize);
  if (codes.length === 0) return undefined;
  for (const code of codes) {
    const match = find(code);
    if (match) {
      return { id: match.displayCode, name: match.name, unit: match.uom };
    }
  }
  return CLEARED_CBS_STAMP;
}

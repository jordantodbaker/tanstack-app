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
 * The two-character size code the CBS catalog uses inside segment 3, or
 * `undefined` when the row's size can't produce one.
 *
 * The encoding is BORE-RELATIVE, which is why the bore class is a parameter
 * rather than something to infer from the number:
 *
 *   Small bore (< 3")   tenths of an inch — .5" → "05", .75" → "07", 1" → "10"
 *   Medium/large bore   whole inches      — 3"  → "03", 12"  → "12"
 *
 * So "10" means 1" under SB and 10" under MB; only the bore segment beside it
 * disambiguates. Verified against the catalog's own names
 * ("...Small Bore 1\"" is 640-SB-1000-00-L, "...Medium Bore 10\"" is
 * 640-MB-1000-00-L).
 *
 * A size that doesn't land on a whole inch (or a whole tenth under SB) has no
 * code — the caller falls back to the bore-level rollup rather than inventing
 * one.
 */
export function pipingSizeCode(
  size: string,
  boreSize: string,
): string | undefined {
  const n = parseFloat(size);
  if (!size || isNaN(n) || n <= 0) return undefined;

  if (boreSize === "SB") {
    // Tenths, TRUNCATED. Every small-bore step is a clean tenth except 3/4",
    // which the catalog writes "07" rather than "08" (640-SB-0700-00-L is
    // named '...Small Bore .75"'). Rounding to the nearest tenth first keeps
    // binary float noise out of it — 0.3 * 10 is 2.9999999999999996.
    const tenths = Math.floor(Math.round(n * 10 * 1000) / 1000);
    return tenths >= 1 && tenths <= 99
      ? String(tenths).padStart(2, "0")
      : undefined;
  }

  // Medium and large bore are exact whole inches. A size between steps (12.5")
  // has no code at all — truncating it would resolve the row to an item that
  // says 12", so it falls through to the bore rollup instead.
  const inches = Math.round(n * 1000) / 1000;
  if (!Number.isInteger(inches) || inches < 1 || inches > 99) return undefined;
  return String(inches).padStart(2, "0");
}

/**
 * How far below the bore level a row can aim: its nominal size code, and its
 * Fabricate/Erect choice once it has made one. Either may be absent — a row
 * fills these in as the estimator works through it.
 */
export type CbsNarrowing = { sizeCode?: string; feCode?: "FB" | "ER" };

/** Catalog abbreviation for the Fabricate / Erect picker, or `undefined` when
 *  the row hasn't chosen one. */
export function fabricateErectCode(
  fabricateErect: string,
): "FB" | "ER" | undefined {
  if (fabricateErect === "Fabricate") return "FB";
  if (fabricateErect === "Erect") return "ER";
  return undefined;
}

/**
 * The CBS cost codes a piping row could resolve to for its metallurgy code +
 * bore size, most specific first, so a caller taking the first available match
 * lands on the closest parent of what the row actually selected.
 *
 * Shapes, as the Master CBS writes them (shop fab 610–620, install 640–650;
 * every row below the metallurgy summary is cost type `L`):
 *
 *   {m}{bore}{NN}{FB|ER}00L  size + work type. `640-LB-12ER-00-L`, "Install
 *                            Carbon Steel Large Bore 12" - Erect".
 *   {m}{bore}{NN}{FB|ER}STL  the same, where the series only carries the
 *                            schedule-qualified rows. `645-LB-12FB-ST-L`,
 *                            "Field Fab Copper LB: 12" Sch Standard or less".
 *                            Copper, Brass, Aluminium and the high alloys have
 *                            no "…{FE}00…" rollup at all.
 *   {m}{bore}{NN}00STL       the nominal-size rollup. `610-LB-1200-ST-L`,
 *                            "Shop Fab Carbon Steel Large Bore 12"".
 *   {m}{bore}{NN}0000L       the same for the series that leaves the schedule
 *                            segment blank. `641-LB-1200-00-L`.
 *   {m}{bore}0000{bore}L     the bore rollup that repeats the bore — the shop
 *                            series. `610-LB-0000-LB-L`, "Shop Fab Carbon
 *                            Steel Large Bore".
 *   {m}{bore}000000L         the plain bore rollup — the install series and
 *                            Grooved. `640-LB-0000-00-L`.
 *
 * The ladder deliberately stops at the bore. The metallurgy-level row
 * (`640-00-0000-00-0`) is a cost type `0` SUMMARY, not a cost account — the
 * master carries no labor row there — so stamping it would put hours against a
 * rollup. Worse, `{m}000000000` matches the summary of *any* L1, so a stale or
 * mistyped metallurgy code would resolve confidently to an unrelated account
 * (603 is "Pipe Shop Support Services & Supplies", not Carbon Steel). Ending
 * at the bore means a code that isn't a real piping series resolves to
 * nothing, and the row shows a blank item rather than a plausible wrong one.
 *
 * Ordered rather than branched on Shop/Field. The shapes don't overlap within a
 * metallurgy code, so first-match is unambiguous.
 *
 * Both inputs are required even though the last candidate ignores the bore: a
 * row with no size yet hasn't finished selecting anything, and stamping the
 * metallurgy rollup onto it would overwrite a Name the estimator picked by hand.
 */
export function pipingCostCodes(
  metallurgyCode: string,
  boreSize: string,
  /** The row's nominal size code, and its Fabricate/Erect choice when it has
   *  made one. Each adds more specific candidates ahead of the rollups; omit
   *  and the ladder starts at the bore level. */
  fabrication?: CbsNarrowing,
): string[] {
  if (!metallurgyCode || !boreSize) return [];
  const m = metallurgyCode;
  const b = boreSize;
  const size = fabrication?.sizeCode;
  const fe = fabrication?.feCode;
  return [
    // Work type is fused to a NOMINAL SIZE in the catalog; there is no
    // bore-level "…-00ER-…" rollup, so these exist only once the row has
    // resolved a size code.
    ...(size && fe ? [`${m}${b}${size}${fe}00L`, `${m}${b}${size}${fe}STL`] : []),
    ...(size ? [`${m}${b}${size}00STL`, `${m}${b}${size}0000L`] : []),
    `${m}${b}0000${b}L`,
    `${m}${b}000000L`,
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
  fabrication?: CbsNarrowing,
): CbsStamp | undefined {
  const codes = pipingCostCodes(metallurgyCode, boreSize, fabrication);
  if (codes.length === 0) return undefined;
  for (const code of codes) {
    const match = find(code);
    if (match) {
      return { id: match.displayCode, name: match.name, unit: match.uom };
    }
  }
  return CLEARED_CBS_STAMP;
}

/**
 * How far a row can narrow below the bore level, or `undefined` when its size
 * doesn't map to a catalog size code — the one input the narrowing can't do
 * without.
 *
 * Convenience so every caller derives the hint the same way rather than each
 * remembering to pair `pipingSizeCode` with `fabricateErectCode`.
 */
export function fabricationHint(
  row: Pick<FefRow, "size" | "boreSize" | "fabricateErect">,
): (CbsNarrowing & { sizeCode: string }) | undefined {
  // The size alone already narrows the row to its nominal-size rollup, so the
  // hint survives a row that hasn't chosen Fabricate/Erect yet. Without a
  // size there is nothing below the bore level to aim at.
  const sizeCode = pipingSizeCode(row.size, row.boreSize);
  if (!sizeCode) return undefined;
  return { sizeCode, feCode: fabricateErectCode(row.fabricateErect) };
}

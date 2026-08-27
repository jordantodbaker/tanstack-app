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
 * ("...Small Bore 1\"" is 633-SB-1000-ST-C, "...Medium Bore 10\"" is
 * 633-MB-1000-ST-C).
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
    // which the catalog writes "07" rather than "08" (633-SB-0700-ST-C is
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

/** Catalog abbreviation for the Fabricate / Erect picker, or `undefined` when
 *  the row hasn't chosen one. */
export function fabricateErectCode(
  fabricateErect: string,
): "FB" | "ER" | undefined {
  if (fabricateErect === "Fabricate") return "FB";
  if (fabricateErect === "Erect") return "ER";
  return undefined;
}

export function pipingCostCodes(
  metallurgyCode: string,
  boreSize: string,
  /** Size + Fabricate/Erect, when the row has both. Adds a more specific
   *  candidate ahead of the rollups; omit and the ladder is unchanged. */
  fabrication?: { sizeCode: string; feCode: "FB" | "ER" },
): string[] {
  if (!metallurgyCode || !boreSize) return [];
  return [
    // {m}{bore}{size}{FB|ER}00C — 633-LB-12ER-00-C, "Install Carbon Steel
    // Large Bore - Erect". The catalog only carries Fabricate/Erect fused to a
    // NOMINAL SIZE; there is no bore-level "…-00ER-…" rollup, so this
    // candidate exists only when the row has resolved a size code. It sits
    // first because it is strictly more specific than everything below.
    ...(fabrication
      ? [`${metallurgyCode}${boreSize}${fabrication.sizeCode}${fabrication.feCode}00C`]
      : []),
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
  fabrication?: { sizeCode: string; feCode: "FB" | "ER" },
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
 * The fabrication hint for a row, or `undefined` when it hasn't chosen a
 * Fabricate/Erect value or its size doesn't map to a catalog size code.
 *
 * Convenience so every caller derives the hint the same way rather than each
 * remembering to pair `pipingSizeCode` with `fabricateErectCode`.
 */
export function fabricationHint(
  row: Pick<FefRow, "size" | "boreSize" | "fabricateErect">,
): { sizeCode: string; feCode: "FB" | "ER" } | undefined {
  const feCode = fabricateErectCode(row.fabricateErect);
  if (!feCode) return undefined;
  const sizeCode = pipingSizeCode(row.size, row.boreSize);
  return sizeCode ? { sizeCode, feCode } : undefined;
}

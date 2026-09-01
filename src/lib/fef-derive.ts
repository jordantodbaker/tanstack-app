/**
 * The FEF take-off's shared derivations: labor hours, the structural-steel
 * quantity, and the text normalization that every write path applies before
 * parsing a number or matching a CBS code.
 *
 * One home for these on purpose. They used to be copied into the cell editors
 * (`fef-cells.tsx`), the range operations (`grid-range.ts`), and the Excel
 * paste dialog (`take-off-paste.ts`); the copies drifted, and a range paste
 * ended up writing labor hours the cell editor would never have produced.
 * Anything that computes a derived FEF field belongs here so all three paths
 * stay in step by construction.
 *
 * No React, no DOM — importable from server code and pure unit tests alike.
 */

/**
 * Labor factor applied when a row doesn't carry one. Rows store "" rather
 * than the default verbatim, so changing this still flows through to every
 * row that never had an explicit factor typed into it.
 */
export const DEFAULT_LABOR_FACTOR = "1";

/**
 * Resolves a row's effective labor factor: the row-stored value if the user
 * typed one, otherwise `DEFAULT_LABOR_FACTOR`. Needed on its own by the Labor
 * Factor input, which displays the effective value rather than the blank.
 */
export function effectiveLaborFactor(storedFactor: string): string {
  return storedFactor !== "" ? storedFactor : DEFAULT_LABOR_FACTOR;
}

/**
 * Derived labor hours = quantity × labor factor, to 1dp. A blank factor falls
 * back to `DEFAULT_LABOR_FACTOR`; a non-numeric quantity or factor yields "".
 *
 * Note this is the *generic* derivation. Piping rows take their hours from the
 * (task code, size) factor table instead — see `deriveLaborHours` in
 * `piping-derive.ts`.
 */
export function computeLaborHours(quantity: string, factor: string): string {
  const q = parseFloat(quantity);
  const f = parseFloat(effectiveLaborFactor(factor));
  if (!Number.isFinite(q) || !Number.isFinite(f)) return "";
  return (q * f).toFixed(1);
}

/**
 * Structural-steel Quantity = # of shapes × length (L). Returns "" when either
 * input isn't a finite number, and strips trailing-zero float noise (e.g.
 * `3 × 20.1` gives `60.3`, not `60.29999…`).
 */
export function computeSteelQuantity(
  shapeCount: string,
  length: string,
): string {
  const n = parseFloat(shapeCount);
  const l = parseFloat(length);
  if (!Number.isFinite(n) || !Number.isFinite(l)) return "";
  return String(Math.round(n * l * 10000) / 10000);
}

/**
 * Strip thousands separators, currency symbols, and whitespace from a pasted
 * numeric cell so "1,200" and "$45.00" compute. The value stays a string (the
 * grid stores strings); non-numeric text comes back stripped, so the user still
 * sees roughly what they pasted.
 */
export function cleanNumber(raw: string): string {
  return raw.replace(/[$,\s]/g, "");
}

/**
 * Normalize a CBS code for matching: drop hyphens and whitespace, lowercase.
 * Lets a pasted code match whether it's the display code ("601-10-0000-00-L")
 * or the cost code, with or without hyphens.
 */
export function normalizeCode(code: string): string {
  return code.replace(/[-\s]/g, "").toLowerCase();
}

/**
 * Total installed cost of a line item: labor only.
 *
 * Material is priced separately and per-unit (`materialCost` is a unit price
 * the rollup multiplies by quantity), so this is deliberately hours x rate and
 * not a whole-line total. Blank whenever either side is missing rather than
 * showing 0.00, which would read as "free" instead of "not priced yet".
 */
export function computeTotalCost(laborHours: string, laborRate: string): string {
  const hours = parseFloat(laborHours);
  const rate = parseFloat(laborRate);
  if (isNaN(hours) || isNaN(rate) || laborRate === "") return "";
  return (hours * rate).toFixed(2);
}

/**
 * The two "unit rate" figures a line item has, both spread over quantity:
 * what one unit COSTS to install, and how many HOURS one unit takes.
 *
 * Two, because the estimate is compared both ways — the Summary page's own
 * "Unit Rate" column has always been the hours one, while a bid comparison
 * wants the money one. They are named for what they measure rather than both
 * being "unit rate", since only the column headers can afford that ambiguity.
 *
 * Quantity must be a positive number for either: at zero there is nothing to
 * divide by, and a blank quantity means the line is not taken off yet. Both
 * give "" — the same "not priced yet" blank `computeTotalCost` uses.
 */
export function computeUnitCost(
  laborHours: string,
  laborRate: string,
  quantity: string,
): string {
  const total = computeTotalCost(laborHours, laborRate);
  const qty = parseFloat(quantity);
  if (total === "" || isNaN(qty) || qty <= 0) return "";
  return (parseFloat(total) / qty).toFixed(2);
}

/** Hours to install ONE of something. The Summary page's "Unit Rate". */
export function computeUnitHours(
  laborHours: string,
  quantity: string,
): string {
  const hours = parseFloat(laborHours);
  const qty = parseFloat(quantity);
  if (isNaN(hours) || isNaN(qty) || qty <= 0) return "";
  return (hours / qty).toFixed(2);
}

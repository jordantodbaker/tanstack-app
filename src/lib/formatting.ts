export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompact(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${formatMoney(n)}`;
}

/**
 * Standard currency display: "$0" for zero / NaN / Infinity, "$X,XXX.XX" for
 * positives, "-$X,XXX.XX" for negatives (sign before the dollar, not before
 * the digits). Shared across the Summary / Reporting / Dashboard surfaces so
 * negative money formats consistently — earlier each file had its own
 * variant and one of them produced "$-100.00" with the sign in the middle.
 */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${formatMoney(abs)}`;
}

/**
 * Currency with an explicit sign for non-zero values: "+$X,XXX.XX" for
 * positive, "-$X,XXX.XX" for negative, "$0" for zero. Use for variance
 * displays where the direction is the whole point.
 */
export function formatSignedCurrency(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n > 0) return `+${formatCurrency(n)}`;
  return formatCurrency(n);
}

/**
 * Performance index / ratio formatter. Returns "—" for nulls and non-finite
 * values (typically when a divisor is zero, e.g. CPI when AC = 0).
 */
export function formatRatio(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

/**
 * Semantic tone — three-way "good / neutral / bad" classifier that callers
 * map to whatever CSS shade fits the surface (some places use slate-800 for
 * neutral, others slate-500). Keeping the semantic decision here and the CSS
 * mapping at the call site avoids forcing every consumer onto identical
 * shades while still centralizing the "what does this number mean" rule.
 */
export type SemanticTone = "slate" | "green" | "red";

/**
 * Cost-variance tone: positive (under budget / favorable) is green; negative
 * (over budget / unfavorable) is red; zero or non-finite is neutral. Use for
 * CV, SV, VAC and the "Δ" columns in variance views.
 */
export function cvTone(n: number): SemanticTone {
  if (!Number.isFinite(n) || n === 0) return "slate";
  return n > 0 ? "green" : "red";
}

/**
 * Performance-index tone: ≥ 1 is green (on or ahead of plan), < 1 is red,
 * null / non-finite is neutral. Use for CPI and SPI.
 */
export function indexTone(n: number | null): SemanticTone {
  if (n === null || !Number.isFinite(n)) return "slate";
  return n >= 1 ? "green" : "red";
}

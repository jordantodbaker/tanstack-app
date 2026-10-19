/**
 * The one- or two-letter markers shown beside a row's name — what it IS (a
 * generated S/M twin) and what it HAS (the workbook's cost-type flags).
 */
import { type CbsRowType, type CbsTreeItem } from "./types";
import { CBS_COST_TYPES, type CbsCostTypeKey } from "./filter";

/** The "S" / "M" marker shown beside generated rows; null for originals.
 *  Reached through `cbsRowTypeBadges`, which is what callers render. */
function rowTypeBadge(
  rowType: CbsRowType,
): { label: string; title: string } | null {
  if (rowType === "SUB") return { label: "S", title: "Generated sub-code row" };
  if (rowType === "MATERIAL") {
    return { label: "M", title: "Generated material row" };
  }
  return null;
}

/** One marker shown beside a row. */
export type CbsBadge = { label: string; title: string };

/** Badges by row type — what a generated row IS. Used where generated rows
 *  sit alongside their originals (Setup, the Master CBS Dictionary). */
export function cbsRowTypeBadges(item: CbsTreeItem): CbsBadge[] {
  const badge = rowTypeBadge(item.rowType);
  return badge ? [badge] : [];
}

/**
 * Badges by the workbook's own flags — what a row HAS. Used where only
 * original rows are listed (the Original Codes view), so the row itself shows
 * whether it carries a sub code, a material code, or both.
 *
 * `only` is the toolbar's cost-type filter. While one is on, a row's other
 * badges are noise: the list is answering "which codes are Material codes?",
 * and every row shown has already earned its place on that flag alone (see
 * `strictCbsRows`), so an L beside the M invites reading the row as Labor too.
 * With nothing filtered the row shows everything it carries, as before.
 */
export function cbsFlagBadges(
  item: CbsTreeItem,
  only?: Partial<Record<CbsCostTypeKey, boolean>>,
): CbsBadge[] {
  const selected = CBS_COST_TYPES.filter((t) => only?.[t.key]);
  const shown = selected.length > 0 ? selected : CBS_COST_TYPES;
  return shown
    .filter((t) => item[t.flag] === true)
    .map((t) => ({ label: t.code, title: `${t.column}: YES` }));
}

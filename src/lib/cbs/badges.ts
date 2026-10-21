/**
 * The one-letter markers shown beside a row's name — what it IS (a generated
 * S/M twin). Every view lists cost lines, so a row's own code already says
 * its cost type; there is no badge for what the account HAS.
 */
import { type CbsRowType, type CbsTreeItem } from "./types";

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
 *  sit alongside their originals: Setup and every CBS browser view. */
export function cbsRowTypeBadges(item: CbsTreeItem): CbsBadge[] {
  const badge = rowTypeBadge(item.rowType);
  return badge ? [badge] : [];
}

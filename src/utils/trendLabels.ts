import { PRIORITY_LABELS } from "~/config/entity-enums";
import type { TrendPriority, TrendStatus } from "./trends";

/**
 * Display labels for `Trend` enum values. Pure data, safe for client UI
 * (badges, dialogs, dashboard) and server-side notification text. Mirrors
 * `rfiLabels.ts` / `fcoLogLabels.ts`.
 */

export const TREND_STATUS_LABELS: Record<TrendStatus, string> = {
  IDENTIFIED: "Identified",
  PROBABLE: "Probable",
  CONVERTED: "Converted",
  REJECTED: "Rejected",
  VOID: "Void",
};

/** The shared priority scale's labels — see `~/config/entity-enums`. */
export const TREND_PRIORITY_LABELS: Record<TrendPriority, string> =
  PRIORITY_LABELS;

import { PRIORITY_LABELS } from "~/config/entity-enums";
import type { RfiPriority, RfiStatus } from "./rfis";

/**
 * Display labels for `Rfi` enum values. Pure data, safe for client UI
 * (badges, dialogs, dashboard) and server-side notification text. No React
 * import; mirrors `changelogLabels.ts` / `fcoLogLabels.ts`.
 */

export const RFI_STATUS_LABELS: Record<RfiStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  ANSWERED: "Answered",
  CLOSED: "Closed",
  SUPERSEDED: "Superseded",
  VOID: "Void",
};

/** The shared priority scale's labels — see `~/config/entity-enums`. */
export const RFI_PRIORITY_LABELS: Record<RfiPriority, string> = PRIORITY_LABELS;

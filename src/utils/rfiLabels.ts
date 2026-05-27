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

export const RFI_PRIORITY_LABELS: Record<RfiPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

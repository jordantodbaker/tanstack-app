import type { PcoPriority, PcoStatus } from "./pco";

/**
 * Display labels for `Pco` enum values. Pure data, safe for client UI
 * (badges, dialogs, dashboard) and server-side notification text. Mirrors
 * `rfiLabels.ts` / `fcoLogLabels.ts` / `trendLabels.ts`.
 */

export const PCO_STATUS_LABELS: Record<PcoStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  NEGOTIATING: "Negotiating",
  APPROVED: "Approved",
  INVOICED: "Invoiced",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  VOID: "Void",
};

export const PCO_PRIORITY_LABELS: Record<PcoPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

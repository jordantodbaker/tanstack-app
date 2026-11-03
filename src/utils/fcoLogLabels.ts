import { PRIORITY_LABELS } from "~/config/entity-enums";
import type { FcoOriginType, FcoPriority, FcoStatus } from "./fcoLog";

/**
 * Display labels for `FieldChangeOrder` enum values. Pure data, safe for both
 * the client UI (`FcoStatusBadge`, dialogs, dashboard) and server-side code
 * that needs human-readable strings (notification messages). No React import.
 */

export const FCO_STATUS_LABELS: Record<FcoStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In Review",
  LINKED_TO_CVR: "Linked to CVR",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IMPLEMENTED: "Implemented",
  CLOSED: "Closed",
  VOID: "Void",
};

/** The shared priority scale's labels — see `~/config/entity-enums`. */
export const FCO_PRIORITY_LABELS: Record<FcoPriority, string> = PRIORITY_LABELS;

export const FCO_ORIGIN_LABELS: Record<FcoOriginType, string> = {
  FIELD_CONDITION: "Field Condition",
  RFI_RESPONSE: "RFI Response",
  DESIGN_OMISSION: "Design Omission",
  DESIGN_CONFLICT: "Design Conflict",
  OWNER_DIRECTIVE: "Owner Directive",
  SAFETY: "Safety",
  REGULATORY: "Regulatory",
  WEATHER: "Weather",
  SUBCONTRACTOR: "Subcontractor",
  OTHER: "Other",
};

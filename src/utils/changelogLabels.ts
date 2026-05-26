import type { ChangeStatus, ChangeType, RiskLevel } from "./changelog";

/**
 * Display labels for `ChangeLog` enum values. Pure data, safe for both the
 * client UI (`StatusBadge`, dialogs, dashboard) and server-side code that
 * needs human-readable strings (notification messages). No React import.
 */

export const STATUS_LABELS: Record<ChangeStatus, string> = {
  REQUESTED: "Requested",
  IN_REVIEW: "In Review",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXECUTED: "Executed",
  VOID: "Void",
};

export const TYPE_LABELS: Record<ChangeType, string> = {
  SCOPE: "Scope",
  COST: "Cost",
  SCHEDULE: "Schedule",
  ENGINEERING: "Engineering",
  CONSTRUCTION: "Construction",
  PROCUREMENT: "Procurement",
  REGULATORY: "Regulatory",
  OTHER: "Other",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

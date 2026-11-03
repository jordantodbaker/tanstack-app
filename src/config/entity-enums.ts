/**
 * The status, type, priority and risk enums of the change-pipeline records,
 * as string unions — one copy, read by the entity modules, the validators and
 * the dialogs alike.
 *
 * They used to be declared in each entity module and copied again into
 * `validators.ts`, which could not import them back without an import cycle.
 * A value added to one copy and forgotten in the other failed only at runtime,
 * as a Zod error on a status the dialog happily offered. Both now read from
 * here, and `prisma/schema.prisma` holds the matching database enums.
 *
 * No imports: this is read by client code, server code and the validators.
 */

// ── CVR (ChangeLog) ─────────────────────────────────────────────────────────

export const CHANGE_STATUSES = [
  "REQUESTED",
  "IN_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "VOID",
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_TYPES = [
  "SCOPE",
  "COST",
  "SCHEDULE",
  "ENGINEERING",
  "CONSTRUCTION",
  "PROCUREMENT",
  "REGULATORY",
  "OTHER",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** The cost buildup's line types. */
export const CVR_COST_TYPES = [
  "LABOR",
  "MATERIAL",
  "EQUIPMENT",
  "SUBCONTRACT",
  "OTHER",
] as const;
export type CvrCostType = (typeof CVR_COST_TYPES)[number];

// ── FCO ─────────────────────────────────────────────────────────────────────

export const FCO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "LINKED_TO_CVR",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "CLOSED",
  "VOID",
] as const;
export type FcoStatus = (typeof FCO_STATUSES)[number];

export const FCO_ORIGIN_TYPES = [
  "FIELD_CONDITION",
  "RFI_RESPONSE",
  "DESIGN_OMISSION",
  "DESIGN_CONFLICT",
  "OWNER_DIRECTIVE",
  "SAFETY",
  "REGULATORY",
  "WEATHER",
  "SUBCONTRACTOR",
  "OTHER",
] as const;
export type FcoOriginType = (typeof FCO_ORIGIN_TYPES)[number];

// ── RFI ─────────────────────────────────────────────────────────────────────

export const RFI_STATUSES = [
  "DRAFT",
  "OPEN",
  "ANSWERED",
  "CLOSED",
  "SUPERSEDED",
  "VOID",
] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

// ── Trend ───────────────────────────────────────────────────────────────────

export const TREND_STATUSES = [
  "IDENTIFIED",
  "PROBABLE",
  "CONVERTED",
  "REJECTED",
  "VOID",
] as const;
export type TrendStatus = (typeof TREND_STATUSES)[number];

// ── PCO ─────────────────────────────────────────────────────────────────────

export const PCO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "NEGOTIATING",
  "APPROVED",
  "INVOICED",
  "CLOSED",
  "REJECTED",
  "VOID",
] as const;
export type PcoStatus = (typeof PCO_STATUSES)[number];

// ── Priority — one scale, shared by FCO, RFI, Trend and PCO ─────────────────

/**
 * The same four steps on every record that has a priority, so an RFI's
 * priority carries over to the FCO it is promoted into unchanged. Each
 * entity module re-exports it under its own name (`FcoPriority`, …) for the
 * callers that read it that way.
 */
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

// ── Which statuses count as "still open" ────────────────────────────────────
// Read by the list pages' stat cards, the dashboard and the reminders.

/** CVR statuses still in flight — not yet executed, rejected, or voided. */
export const CVR_OPEN_STATUSES: ChangeStatus[] = [
  "REQUESTED",
  "IN_REVIEW",
  "PENDING_APPROVAL",
];

/** FCOs still being worked, the ones promoted to a CVR included. */
export const FCO_OPEN_STATUSES: FcoStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "LINKED_TO_CVR",
];

/** RFIs still expecting attention — drafts, open questions, awaiting close. */
export const RFI_OPEN_STATUSES: RfiStatus[] = ["DRAFT", "OPEN", "ANSWERED"];

/** PCOs not yet approved, invoiced or closed. */
export const PCO_OPEN_STATUSES: PcoStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "NEGOTIATING",
];

/** Trends that still contribute to the forecast. */
export const TREND_ACTIVE_STATUSES: TrendStatus[] = ["IDENTIFIED", "PROBABLE"];

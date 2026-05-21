import type { ChangeStatus } from "./changelog";
import type { FcoStatus } from "./fcoLog";
import { hasAtLeastRole, type UserRole } from "./users";

/**
 * Approval-workflow definitions. Pure, client-safe data: the single source of
 * truth for legal status transitions. The UI renders a button per available
 * transition; the server validates requested transitions against the same
 * maps. Any edge not listed here is forbidden.
 */

export type Transition<S extends string> = {
  /** Button label and the action id the server matches on. */
  action: string;
  /** Status the record moves to. */
  to: S;
  /** Minimum privilege the actor needs to perform this transition. */
  minRole: UserRole;
  /** When true, the actor may not be the record's originator (no self-sign-off). */
  blockOriginator?: boolean;
};

/**
 * CVR (ChangeLog) lifecycle. Terminal states (EXECUTED, VOID) have no exits.
 */
export const CVR_TRANSITIONS: Record<
  ChangeStatus,
  Transition<ChangeStatus>[]
> = {
  REQUESTED: [
    { action: "Submit for review", to: "IN_REVIEW", minRole: "USER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  IN_REVIEW: [
    { action: "Advance to approval", to: "PENDING_APPROVAL", minRole: "APPROVER" },
    { action: "Send back", to: "REQUESTED", minRole: "APPROVER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  PENDING_APPROVAL: [
    {
      action: "Approve",
      to: "APPROVED",
      minRole: "APPROVER",
      blockOriginator: true,
    },
    {
      action: "Reject",
      to: "REJECTED",
      minRole: "APPROVER",
      blockOriginator: true,
    },
    { action: "Send back", to: "IN_REVIEW", minRole: "APPROVER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  APPROVED: [
    { action: "Mark executed", to: "EXECUTED", minRole: "USER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  REJECTED: [
    { action: "Revise & resubmit", to: "REQUESTED", minRole: "USER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  EXECUTED: [],
  VOID: [],
};

/**
 * FCO lifecycle. `LINKED_TO_CVR` is reached via promote-to-CVR, not a
 * workflow action. Terminal states (CLOSED, VOID) have no exits.
 */
export const FCO_TRANSITIONS: Record<FcoStatus, Transition<FcoStatus>[]> = {
  DRAFT: [
    { action: "Submit", to: "SUBMITTED", minRole: "USER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  SUBMITTED: [
    { action: "Begin review", to: "IN_REVIEW", minRole: "APPROVER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  IN_REVIEW: [
    {
      action: "Approve",
      to: "APPROVED",
      minRole: "APPROVER",
      blockOriginator: true,
    },
    {
      action: "Reject",
      to: "REJECTED",
      minRole: "APPROVER",
      blockOriginator: true,
    },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  LINKED_TO_CVR: [{ action: "Void", to: "VOID", minRole: "ADMINISTRATOR" }],
  APPROVED: [
    { action: "Mark implemented", to: "IMPLEMENTED", minRole: "USER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  REJECTED: [
    { action: "Return to draft", to: "DRAFT", minRole: "USER" },
    { action: "Void", to: "VOID", minRole: "ADMINISTRATOR" },
  ],
  IMPLEMENTED: [{ action: "Close", to: "CLOSED", minRole: "USER" }],
  CLOSED: [],
  VOID: [],
};

/**
 * The transitions a user may perform from `status` — filtered by privilege
 * and the originator block. `isOriginator` should be true when the acting
 * user raised the record. Drives both the UI (which buttons to show) and the
 * server (whether a requested action is permitted).
 */
export function availableTransitions<S extends string>(
  map: Record<S, Transition<S>[]>,
  status: S,
  userRole: UserRole,
  isOriginator: boolean,
): Transition<S>[] {
  return (map[status] ?? []).filter(
    (t) =>
      hasAtLeastRole(userRole, t.minRole) &&
      !(t.blockOriginator && isOriginator),
  );
}

import type { PrismaClient } from "../generated/prisma/client";
import type { CurrentUser } from "./users";
import type { Transition } from "./workflow";
import { availableTransitions } from "./workflow";
import { diffFields, recordUpdate } from "./audit.server";
import { emitWorkflowNotification } from "./notifications.server";

/**
 * SERVER-ONLY shared transition orchestration for CVR/FCO workflow handlers.
 * Encapsulates the parts that were drifting between `transitionChangeLog`
 * and `transitionFco`: privilege check, audit recording, notification emit,
 * and the destination-status look-up.
 *
 * Entity-specific bits (which prisma model, which audit fields, how to build
 * the title, optional per-transition extra payload like CVR's approver stamp)
 * are passed in via `config` and the `updateRow` callback. The caller owns
 * the surrounding transaction.
 */

type WorkflowTx = Pick<
  PrismaClient,
  "auditEvent" | "notification" | "user"
>;

type RowMinimum = {
  id: number;
  projectId: number;
  status: string;
  createdById: number | null;
};

export type WorkflowTransitionConfig<
  Row extends RowMinimum,
  S extends string,
> = {
  /** Matches `AuditEvent.entityType` and `Notification.entityType`. */
  entityType: string;
  transitionMap: Record<S, Transition<S>[]>;
  statusLabels: Record<S, string>;
  /** Destination statuses that should fan out a notification to reviewers/approvers. */
  statusesNeedingReview: ReadonlySet<string>;
  /** Audit fields to diff. Always includes `status` (and any field touched by `extraUpdateData`). */
  auditFields: readonly (keyof Row)[];
  /** Human-readable title for the notification (e.g. "CVR-001 — Replace pump"). */
  buildTitle: (row: Row) => string;
  /** Optional extra update payload for specific transitions (e.g. CVR stamps approver+approvedAt on APPROVED). */
  extraUpdateData?: (
    transition: Transition<S>,
    actor: CurrentUser,
  ) => Record<string, unknown>;
};

/**
 * Validates and applies a workflow transition. Throws when the requested
 * action isn't permitted from the current status for this actor. Caller
 * provides `updateRow`, which should close over the surrounding `tx` and
 * apply the merged payload to the correct prisma model.
 */
export async function applyWorkflowTransition<
  Row extends RowMinimum,
  S extends string,
>({
  tx,
  before,
  actor,
  action,
  comment,
  config,
  updateRow,
}: {
  tx: WorkflowTx;
  before: Row;
  actor: CurrentUser;
  action: string;
  comment?: string;
  config: WorkflowTransitionConfig<Row, S>;
  updateRow: (data: Record<string, unknown>) => Promise<Row>;
}): Promise<Row> {
  const isOriginator =
    before.createdById !== null && before.createdById === actor.id;
  const transition = availableTransitions(
    config.transitionMap,
    before.status as S,
    actor.role,
    isOriginator,
  ).find((t) => t.action === action);
  if (!transition) {
    throw new Error(
      `"${action}" is not a permitted transition from ${before.status}.`,
    );
  }

  const extra = config.extraUpdateData?.(transition, actor) ?? {};
  const updated = await updateRow({ status: transition.to, ...extra });

  await recordUpdate(
    tx,
    {
      entityType: config.entityType,
      entityId: updated.id,
      projectId: updated.projectId,
      actor,
    },
    diffFields(before, updated, config.auditFields),
    comment,
  );

  const fromLabel = config.statusLabels[before.status as S];
  const toLabel = config.statusLabels[updated.status as S];
  await emitWorkflowNotification(tx, {
    entityType: config.entityType,
    entityId: updated.id,
    projectId: updated.projectId,
    title: config.buildTitle(updated),
    message: `Status: ${fromLabel} → ${toLabel}`,
    originatorId: updated.createdById,
    actor,
    needsReview: config.statusesNeedingReview.has(updated.status),
  });

  return updated;
}

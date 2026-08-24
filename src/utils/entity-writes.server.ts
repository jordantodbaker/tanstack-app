import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../server/db";
import { assertProjectAccess, resolveCurrentUser } from "./users.server";
import { recordDelete } from "./audit.server";
import {
  applyWorkflowTransition,
  type WorkflowTransitionConfig,
} from "./workflow.server";
import {
  flushNotificationEmails,
  type PendingNotificationEmail,
} from "./notification-email.server";

/**
 * Shared write-path bodies for the change-pipeline entities (CVR/FCO/RFI/
 * Trend/PCO). Companion to `entity-reads.server.ts`: each entity keeps its own
 * top-level `createServerFn(...)` declaration (TanStack Start extracts those at
 * module scope), but the handler delegates here so the auth + transaction
 * plumbing lives in one place.
 */

/**
 * The delegate shape every Prisma model satisfies for a delete-by-id. Typed
 * structurally with `any` for the same reason `ReadDelegate` is — a precise
 * type fights Prisma's per-`select` return narrowing, and a single helper has
 * to work across every model. The looseness is sealed inside this file; call
 * sites stay typed because `pickDelegate` receives a real
 * `Prisma.TransactionClient`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type DeleteDelegate = {
  findUniqueOrThrow: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Delete one project-scoped record by id and write its audit event.
 *
 * The `projectId` lookup, the access check, the delete and the audit row all
 * run inside a single transaction. Doing the lookup in the transaction is what
 * closes the race where a row's project could be reassigned between the access
 * check and the delete — an out-of-transaction check can authorize against a
 * project the row no longer belongs to. Three of the five entities previously
 * checked outside the transaction; routing them all through here makes the
 * safe ordering the only ordering.
 *
 * `entityType` is the audit log's discriminator and must match the string the
 * entity's other audit writers use (`"ChangeLog"`, `"FieldChangeOrder"`, …),
 * not the Prisma delegate name.
 *
 * Relation cleanup is left to the schema's referential actions — e.g. deleting
 * a PCO relies on `SetNull` on `ChangeLog.linkedPco` to unlink its CVRs rather
 * than orphan them.
 */
export async function deleteProjectScopedRecord(opts: {
  id: number;
  entityType: string;
  pickDelegate: (tx: Prisma.TransactionClient) => DeleteDelegate;
}): Promise<{ ok: true }> {
  const actor = await resolveCurrentUser();
  if (!actor) throw new Error("Unauthorized: not signed in");
  await prisma.$transaction(async (tx) => {
    const delegate = opts.pickDelegate(tx);
    const row = await delegate.findUniqueOrThrow({
      where: { id: opts.id },
      select: { projectId: true },
    });
    await assertProjectAccess(actor, row.projectId);
    await delegate.delete({ where: { id: opts.id } });
    await recordDelete(tx, {
      entityType: opts.entityType,
      entityId: opts.id,
      projectId: row.projectId,
      actor,
    });
  });
  return { ok: true };
}

/** Delegate shape for the transition path: read the row, then update it. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type TransitionDelegate = {
  findUniqueOrThrow: (...args: any[]) => any;
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The row shape `applyWorkflowTransition` requires of every entity. */
type RowMinimum = {
  id: number;
  projectId: number;
  status: string;
  createdById: number | null;
};

/**
 * Apply a workflow transition to one project-scoped record and return the
 * mapped item.
 *
 * This is the plumbing all five change-pipeline entities repeated around
 * `applyWorkflowTransition`: resolve the actor, open a transaction, read the
 * `before` row, authorize, apply the transition, commit, then flush queued
 * notification emails. Only the delegate, the optional relation `include`, the
 * workflow `config` and the row→item mapper actually differ per entity.
 *
 * As with `deleteProjectScopedRecord`, the row read and the access check both
 * happen inside the transaction. CVR and FCO already did this; PCO, RFI and
 * Trend instead pre-read the row's `projectId` outside the transaction,
 * authorized against that, then re-read the row inside without rechecking —
 * the same reassignment race, plus a redundant round-trip per call. Routing
 * every entity through here removes both.
 *
 * `config` may be a function of the `before` row for entities whose
 * `extraUpdateData` depends on prior state (PCO stamps `submittedAt` only on
 * the first submission, and seeds `approvedAmount` from `requestedAmount`).
 *
 * Emails are flushed only after the transaction commits, so a rolled-back
 * transition never sends one.
 */
export async function transitionProjectScopedRecord<
  Row extends RowMinimum,
  S extends string,
  Item,
>(opts: {
  id: number;
  action: string;
  comment?: string;
  pickDelegate: (tx: Prisma.TransactionClient) => TransitionDelegate;
  /** Relation include applied to BOTH the `before` read and the update, so the
   *  row leaving the transaction already carries what `toItem` needs. */
  include?: object;
  config:
    | WorkflowTransitionConfig<Row, S>
    | ((before: Row) => WorkflowTransitionConfig<Row, S>);
  toItem: (row: Row) => Item;
}): Promise<Item> {
  const actor = await resolveCurrentUser();
  if (!actor) throw new Error("Unauthorized: not signed in");

  const includeArg = opts.include ? { include: opts.include } : {};
  const pendingEmails: PendingNotificationEmail[] = [];

  const row = await prisma.$transaction(async (tx) => {
    const delegate = opts.pickDelegate(tx);
    const before = (await delegate.findUniqueOrThrow({
      where: { id: opts.id },
      ...includeArg,
    })) as Row;
    await assertProjectAccess(actor, before.projectId);
    return applyWorkflowTransition<Row, S>({
      tx,
      before,
      actor,
      action: opts.action,
      comment: opts.comment,
      pendingEmails,
      config:
        typeof opts.config === "function" ? opts.config(before) : opts.config,
      updateRow: (payload) =>
        delegate.update({
          where: { id: before.id },
          data: payload,
          ...includeArg,
        }),
    });
  });

  // After commit: send email copies (no-op unless email is configured).
  await flushNotificationEmails(pendingEmails);
  return opts.toItem(row);
}

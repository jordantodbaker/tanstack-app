import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../server/db";
import { assertProjectAccess, resolveCurrentUser } from "./users.server";
import { assertProjectUnchanged, type CurrentUser } from "./users";
import { allocateIfBlank } from "./entityNumbers.server";
import {
  diffFields,
  recordCreate,
  recordDelete,
  recordUpdate,
} from "./audit.server";
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

/** Delegate shape for the upsert path: read, update, create. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type UpsertDelegate = {
  findUniqueOrThrow: (...args: any[]) => any;
  update: (...args: any[]) => any;
  create: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Create-or-update one project-scoped record, with its audit event.
 *
 * The third of the shared write paths (see `deleteProjectScopedRecord` and
 * `transitionProjectScopedRecord`). All five change-pipeline entities repeated
 * this skeleton: resolve the actor, open a transaction, branch on `id`, and on
 * the update side re-read the row, authorize against ITS project, refuse a
 * cross-project move, write, and audit; on the create side authorize the
 * claimed project, allocate a record number when blank, stamp `createdById`,
 * write, and audit.
 *
 * **Authorization is per-branch and inside the transaction**, which is the
 * shape CVR and FCO already used: an update authorizes against the row's
 * existing `projectId`, never the caller-supplied one, because trusting
 * `data.projectId` on an update would let someone with access to project A
 * edit (and reassign) a row living in project B. RFI, Trend and PCO reached
 * the same guarantee by *also* checking the claimed project up front, which
 * cost a redundant query; `assertProjectUnchanged` already forces the two ids
 * to agree, so the in-transaction check alone is sufficient.
 *
 * `projectId` is set on create only and is never part of `payload` — it can't
 * change on an update (the assertion above forbids it), and it appears in no
 * entity's audit-field list.
 *
 * Hooks, both inside the transaction:
 *  - `validate` runs after authorization and before the write — for checks
 *    that need the DB, like Trend verifying its linked RFI/FCO belong to the
 *    same project. Running it here rather than before the transaction means
 *    the check and the write see the same snapshot.
 *  - `afterWrite` receives the resolved actor (so follow-on audit rows are
 *    attributed without re-resolving) and may return a replacement row, for
 *    entities that do follow-on work and then need to re-read with relations
 *    (CVR's line-item buildup, PCO's CVR link sync).
 */
export async function upsertProjectScopedRecord<
  Row extends { id: number; projectId: number },
  Item,
>(opts: {
  /** Present for an update, absent for a create. */
  id?: number;
  projectId: number;
  /** Audit-log discriminator, e.g. "ChangeLog" / "FieldChangeOrder". */
  entityType: string;
  /** Human label for the cross-project-move error ("FCO", "change item"). */
  label: string;
  pickDelegate: (tx: Prisma.TransactionClient) => UpsertDelegate;
  /** Editable columns. Must NOT include `projectId`. */
  payload: Record<string, unknown>;
  auditFields: readonly string[];
  /** Auto-assigned record number: the column and the client's value (blank
   *  means "allocate one"). Omit for entities without a number sequence. */
  numbering?: { field: string; value: string };
  /** Relation include applied to the write, so the row already carries what
   *  `toItem` needs. Skip it when `afterWrite` re-reads instead. */
  include?: object;
  validate?: (tx: Prisma.TransactionClient) => Promise<void>;
  afterWrite?: (
    tx: Prisma.TransactionClient,
    id: number,
    actor: CurrentUser,
  ) => Promise<Row | void>;
  toItem: (row: Row) => Item;
}): Promise<Item> {
  const actor = await resolveCurrentUser();
  if (!actor) throw new Error("Unauthorized: not signed in");

  const includeArg = opts.include ? { include: opts.include } : {};

  const row = await prisma.$transaction(async (tx) => {
    const delegate = opts.pickDelegate(tx);
    let written: Row;

    if (opts.id !== undefined) {
      const before = (await delegate.findUniqueOrThrow({
        where: { id: opts.id },
      })) as Row;
      await assertProjectAccess(actor, before.projectId);
      assertProjectUnchanged(opts.label, opts.projectId, before.projectId);
      await opts.validate?.(tx);
      written = (await delegate.update({
        where: { id: opts.id },
        data: opts.payload,
        ...includeArg,
      })) as Row;
      await recordUpdate(
        tx,
        {
          entityType: opts.entityType,
          entityId: written.id,
          projectId: written.projectId,
          actor,
        },
        diffFields(
          before,
          written,
          opts.auditFields as readonly (keyof Row)[],
        ),
      );
    } else {
      await assertProjectAccess(actor, opts.projectId);
      await opts.validate?.(tx);
      written = (await delegate.create({
        data: {
          ...opts.payload,
          ...(opts.numbering
            ? {
                // A typed-in number (manual override / legacy import) is kept
                // as-is; a blank one draws from the project's sequence.
                [opts.numbering.field]: await allocateIfBlank(
                  tx,
                  opts.projectId,
                  opts.entityType as Parameters<typeof allocateIfBlank>[2],
                  opts.numbering.value,
                ),
              }
            : {}),
          projectId: opts.projectId,
          createdById: actor.id,
        },
        ...includeArg,
      })) as Row;
      await recordCreate(tx, {
        entityType: opts.entityType,
        entityId: written.id,
        projectId: written.projectId,
        actor,
      });
    }

    const replacement = await opts.afterWrite?.(tx, written.id, actor);
    return replacement ?? written;
  });

  return opts.toItem(row);
}

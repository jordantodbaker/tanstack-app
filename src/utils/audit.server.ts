import type { PrismaClient } from "../generated/prisma/client";
import type { CurrentUser } from "./users";

/**
 * SERVER-ONLY audit-log writers. Append-only: one row per CREATE/DELETE, one
 * row per changed field on UPDATE.
 *
 * Every writer takes an `AuditDb` — satisfied by both the top-level `prisma`
 * client and a `$transaction` `tx`. Always pass the `tx` from the mutation's
 * transaction so the audit row commits atomically with the change it
 * describes; a half-written audit log is worse than none.
 */
type AuditDb = Pick<PrismaClient, "auditEvent">;

type AuditableValue =
  | string
  | number
  | boolean
  | string[]
  | Date
  | null
  | undefined;

export type FieldChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

/** Normalizes a value to the log's string form; `""` / empty / nullish → null. */
function norm(v: AuditableValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Diffs `before` vs `after` over `fields`, returning one entry per field
 * whose normalized value changed. This is what turns an UPDATE into a set of
 * per-field audit events.
 */
export function diffFields<T>(
  before: T,
  after: T,
  fields: readonly (keyof T)[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const oldValue = norm(before[field] as AuditableValue);
    const newValue = norm(after[field] as AuditableValue);
    if (oldValue !== newValue) {
      changes.push({ field: String(field), oldValue, newValue });
    }
  }
  return changes;
}

export type AuditTarget = {
  entityType: string;
  entityId: number;
  /** Owning project, or null for non-project-scoped entities (e.g. User). */
  projectId: number | null;
  actor: CurrentUser;
};

export async function recordCreate(
  db: AuditDb,
  target: AuditTarget,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      projectId: target.projectId,
      action: "CREATE",
      actorId: target.actor.id,
      actorEmail: target.actor.email,
    },
  });
}

export async function recordDelete(
  db: AuditDb,
  target: AuditTarget,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      projectId: target.projectId,
      action: "DELETE",
      actorId: target.actor.id,
      actorEmail: target.actor.email,
    },
  });
}

/** Records one UPDATE event per changed field. No-op when nothing changed. */
export async function recordUpdate(
  db: AuditDb,
  target: AuditTarget,
  changes: FieldChange[],
): Promise<void> {
  if (changes.length === 0) return;
  await db.auditEvent.createMany({
    data: changes.map((c) => ({
      entityType: target.entityType,
      entityId: target.entityId,
      projectId: target.projectId,
      action: "UPDATE" as const,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      actorId: target.actor.id,
      actorEmail: target.actor.email,
    })),
  });
}

import { prisma } from "../server/db";
import {
  CHANGE_ENTITIES,
  CHANGE_ENTITY_TYPES,
  formatRecordRef,
  isChangeEntityType,
  type ChangeEntityType,
} from "~/config/change-entities";

/**
 * SERVER-ONLY. Single source of truth for "look up the parent record" of a
 * polymorphic child (Attachment, Comment, future others) given its
 * `(entityType, entityId)` pair.
 *
 * Why this exists: attachments and comments once each maintained their own
 * entity-type switches and drifted apart — attachments only handled
 * ChangeLog/FCO and silently fell through to the FieldChangeOrder table
 * for RFI/Trend/PCO ids (so cross-table-ID collisions could "pass" the
 * project-membership check). Comments handled ChangeLog/FCO/RFI but
 * defaulted to the RFI table for Trend/PCO.
 *
 * Every caller now goes through `lookupParentRecord` (or
 * `assertParentInProject` over it), which default-DENIES any unknown entity
 * type. The record types are `CHANGE_ENTITIES`; the one thing this module
 * adds is which Prisma delegate each one lives in.
 */

/** Every entity type that can host child records (attachments, comments). */
export const PARENTABLE_ENTITY_TYPES = CHANGE_ENTITY_TYPES;
export type ParentableEntityType = ChangeEntityType;

export function isParentableEntityType(s: string): s is ParentableEntityType {
  return isChangeEntityType(s);
}

/**
 * Generic shape every parent record reduces to from the child's POV: the
 * project it belongs to, who raised it (for originator-notification fan-out),
 * and a human-readable title for notification messages. Specific entity-type
 * fields (cvrNumber, fcoNumber, rfiNumber, …) are folded into `title` here
 * so consumers stay polymorphic.
 */
export type ParentRecord = {
  projectId: number;
  /** User.id of the originator, or null on rows that pre-date `createdById`. */
  originatorId: number | null;
  title: string;
};

/**
 * The delegate each record type lives in. Loosely typed on purpose: the
 * `select` is built from the registry's column names, which Prisma's
 * per-model types cannot follow, and the row is read back by those same
 * names.
 */
type ParentDelegate = {
  findUnique: (args: {
    where: { id: number };
    select: Record<string, true>;
  }) => Promise<Record<string, unknown> | null>;
};
const DELEGATES: Record<ChangeEntityType, () => ParentDelegate> = {
  ChangeLog: () => prisma.changeLog as unknown as ParentDelegate,
  FieldChangeOrder: () => prisma.fieldChangeOrder as unknown as ParentDelegate,
  Rfi: () => prisma.rfi as unknown as ParentDelegate,
  Trend: () => prisma.trend as unknown as ParentDelegate,
  Pco: () => prisma.pco as unknown as ParentDelegate,
};

/**
 * Looks up the parent record. Throws when the entity type isn't recognized
 * (default-deny) and when no record exists with that id.
 *
 * Callers checking a project the client claimed use `assertParentInProject`.
 * The comparison is not built in here because some callers —
 * `downloadAttachment` etc. — don't take a claimed projectId; they derive it.
 */
export async function lookupParentRecord(
  entityType: string,
  entityId: number,
): Promise<ParentRecord> {
  if (!isChangeEntityType(entityType)) {
    // Default-DENY. The agent-audit finding that motivated this module: the
    // previous in-place switches silently fell through to a default
    // `prisma.fieldChangeOrder` / `prisma.rfi` lookup for unknown types,
    // which could "pass" an existence check against the wrong table.
    throw new Error(`Unknown parent entity type: ${entityType}.`);
  }
  const def = CHANGE_ENTITIES[entityType];
  const row = await DELEGATES[entityType]().findUnique({
    where: { id: entityId },
    select: {
      projectId: true,
      createdById: true,
      [def.numberField]: true,
      [def.titleField]: true,
    },
  });
  if (!row) throw new Error(`${entityType} #${entityId} not found.`);
  return {
    projectId: row.projectId as number,
    originatorId: (row.createdById as number | null) ?? null,
    title: formatRecordRef(entityType, { ...row, id: entityId }),
  };
}

/**
 * Throws "<what> does not belong to this project." unless `row` was found and
 * sits in `projectId`. For input that names a record by id — a linked RFI, a
 * source version — so tampered ids can't reach across projects.
 */
export function assertSameProject(
  row: { projectId: number } | null,
  projectId: number,
  what: string,
): void {
  if (!row || row.projectId !== projectId) {
    throw new Error(`${what} does not belong to this project.`);
  }
}

/**
 * `lookupParentRecord`, then the check that the parent is in the project the
 * caller claimed. Returns the parent for callers that need its title or
 * originator.
 */
export async function assertParentInProject(
  entityType: string,
  entityId: number,
  projectId: number,
): Promise<ParentRecord> {
  const parent = await lookupParentRecord(entityType, entityId);
  if (parent.projectId !== projectId) {
    throw new Error(
      `${entityType} #${entityId} does not belong to this project.`,
    );
  }
  return parent;
}

import { prisma } from "../server/db";

/**
 * SERVER-ONLY. Single source of truth for "look up the parent record" of a
 * polymorphic child (Attachment, Comment, future others) given its
 * `(entityType, entityId)` pair.
 *
 * Why this exists: `attachments.ts:assertEntityInProject` and
 * `comments.ts:readParentRecord` independently maintained their own
 * entity-type switches and drifted apart — attachments only handled
 * ChangeLog/FCO and silently fell through to the FieldChangeOrder table
 * for RFI/Trend/PCO ids (so cross-table-ID collisions could "pass" the
 * project-membership check). Comments handled ChangeLog/FCO/RFI but
 * defaulted to the RFI table for Trend/PCO.
 *
 * Both call sites now go through `lookupParentRecord`, which default-DENIES
 * any unknown entity type. Adding a new pollable entity (the next RFI/PCO/
 * Trend-shaped record) requires exactly one switch arm here, and the
 * downstream callers get correct behavior for free.
 */

/** Every entity type that can host child records (attachments, comments).
 *  Adding to this list requires a matching switch arm in
 *  `lookupParentRecord` below — the type narrowing forces it. */
export const PARENTABLE_ENTITY_TYPES = [
  "ChangeLog",
  "FieldChangeOrder",
  "Rfi",
  "Trend",
  "Pco",
] as const;
export type ParentableEntityType = (typeof PARENTABLE_ENTITY_TYPES)[number];

export function isParentableEntityType(s: string): s is ParentableEntityType {
  return (PARENTABLE_ENTITY_TYPES as readonly string[]).includes(s);
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
 * Looks up the parent record. Throws when the entity type isn't recognized
 * (default-deny) and when no record exists with that id.
 *
 * Callers that need to assert "the parent is in `claimedProjectId`" should
 * compare the returned `projectId` themselves. Centralizing that comparison
 * here would be too restrictive — `downloadAttachment` etc. don't take a
 * claimed projectId, they derive it.
 */
export async function lookupParentRecord(
  entityType: string,
  entityId: number,
): Promise<ParentRecord> {
  switch (entityType) {
    case "ChangeLog": {
      const row = await prisma.changeLog.findUnique({
        where: { id: entityId },
        select: {
          projectId: true,
          createdById: true,
          cvrNumber: true,
          title: true,
        },
      });
      if (!row) throw new Error(`ChangeLog #${entityId} not found.`);
      return {
        projectId: row.projectId,
        originatorId: row.createdById,
        title: `${row.cvrNumber || `CVR #${entityId}`} — ${row.title}`,
      };
    }
    case "FieldChangeOrder": {
      const row = await prisma.fieldChangeOrder.findUnique({
        where: { id: entityId },
        select: {
          projectId: true,
          createdById: true,
          fcoNumber: true,
          title: true,
        },
      });
      if (!row) throw new Error(`FieldChangeOrder #${entityId} not found.`);
      return {
        projectId: row.projectId,
        originatorId: row.createdById,
        title: `${row.fcoNumber || `FCO #${entityId}`} — ${row.title}`,
      };
    }
    case "Rfi": {
      const row = await prisma.rfi.findUnique({
        where: { id: entityId },
        select: {
          projectId: true,
          createdById: true,
          rfiNumber: true,
          subject: true,
        },
      });
      if (!row) throw new Error(`Rfi #${entityId} not found.`);
      return {
        projectId: row.projectId,
        originatorId: row.createdById,
        title: `${row.rfiNumber || `RFI #${entityId}`} — ${row.subject}`,
      };
    }
    case "Trend": {
      const row = await prisma.trend.findUnique({
        where: { id: entityId },
        select: {
          projectId: true,
          createdById: true,
          trendNumber: true,
          title: true,
        },
      });
      if (!row) throw new Error(`Trend #${entityId} not found.`);
      return {
        projectId: row.projectId,
        originatorId: row.createdById,
        title: `${row.trendNumber || `Trend #${entityId}`} — ${row.title}`,
      };
    }
    case "Pco": {
      const row = await prisma.pco.findUnique({
        where: { id: entityId },
        select: {
          projectId: true,
          createdById: true,
          pcoNumber: true,
          title: true,
        },
      });
      if (!row) throw new Error(`Pco #${entityId} not found.`);
      return {
        projectId: row.projectId,
        originatorId: row.createdById,
        title: `${row.pcoNumber || `PCO #${entityId}`} — ${row.title}`,
      };
    }
    default:
      // Default-DENY. The agent-audit finding that motivated this module: the
      // previous in-place switches silently fell through to a default
      // `prisma.fieldChangeOrder` / `prisma.rfi` lookup for unknown types,
      // which could "pass" an existence check against the wrong table.
      throw new Error(`Unknown parent entity type: ${entityType}.`);
  }
}

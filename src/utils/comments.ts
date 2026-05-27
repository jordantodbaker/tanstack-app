import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";
import { emitCommentNotification } from "./notifications.server";

/**
 * Comments API — append-only discussion threads attached to a CVR / FCO /
 * RFI. Each comment carries its own `entityType` + `entityId` (polymorphic,
 * same shape as `Attachment` and `AuditEvent`); the parent record's
 * `createdById` drives the originator-notification fan-out via
 * `emitCommentNotification`.
 *
 * No edit, no delete in v1 — matches the audit-log philosophy. Add a 5-min
 * author edit window later if users push back on typos.
 */

export const COMMENT_ENTITY_TYPES = [
  "ChangeLog",
  "FieldChangeOrder",
  "Rfi",
  "Trend",
  "Pco",
] as const;
export type CommentEntityType = (typeof COMMENT_ENTITY_TYPES)[number];

function isCommentEntityType(s: string): s is CommentEntityType {
  return (COMMENT_ENTITY_TYPES as readonly string[]).includes(s);
}

export type CommentItem = {
  id: number;
  entityType: CommentEntityType;
  entityId: number;
  projectId: number;
  body: string;
  authorId: number;
  authorEmail: string;
  createdAt: string;
};

type CommentRow = Awaited<ReturnType<typeof prisma.comment.findMany>>[number];

const toItem = (r: CommentRow): CommentItem => ({
  id: r.id,
  entityType: r.entityType as CommentEntityType,
  entityId: r.entityId,
  projectId: r.projectId,
  body: r.body,
  authorId: r.authorId,
  authorEmail: r.authorEmail,
  createdAt: r.createdAt.toISOString(),
});

/** Hard cap on a single comment's body. Long enough for real paragraphs,
 *  short enough to keep one comment from becoming a wall of text. */
export const MAX_COMMENT_LENGTH = 5000;

/**
 * Looks up the parent record's projectId + the originator (createdById) +
 * a human-readable title in one query. Used by `postComment` to (a)
 * confirm the entity belongs to the claimed project, and (b) populate the
 * notification's `originatorId` + `title` fields.
 */
async function readParentRecord(
  entityType: CommentEntityType,
  entityId: number,
): Promise<{
  projectId: number;
  originatorId: number | null;
  title: string;
}> {
  if (entityType === "ChangeLog") {
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
  if (entityType === "FieldChangeOrder") {
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

export const fetchComments = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      entityType: string;
      entityId: number;
      projectId: number;
    }) => input,
  )
  .handler(async ({ data }): Promise<CommentItem[]> => {
    await requireProjectAccess(data.projectId);
    if (!isCommentEntityType(data.entityType)) return [];
    const rows = await prisma.comment.findMany({
      where: {
        entityType: data.entityType,
        entityId: data.entityId,
        projectId: data.projectId,
      },
      // Oldest first — conversation order. The compose box at the bottom
      // means the freshest message sits next to where the user is typing.
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toItem);
  });

export const commentsQueryOptions = (input: {
  entityType: CommentEntityType;
  entityId: number | null;
  projectId: number | null;
}) =>
  queryOptions({
    queryKey: ["comments", input.entityType, input.entityId],
    queryFn: (): Promise<CommentItem[]> =>
      input.entityId === null || input.projectId === null
        ? Promise.resolve([])
        : fetchComments({
            data: {
              entityType: input.entityType,
              entityId: input.entityId,
              projectId: input.projectId,
            },
          }),
    enabled: input.entityId !== null && input.projectId !== null,
    staleTime: 30 * 1000,
  });

export type PostCommentInput = {
  entityType: CommentEntityType;
  entityId: number;
  projectId: number;
  body: string;
};

export const postComment = createServerFn({ method: "POST" })
  .inputValidator((input: PostCommentInput) => input)
  .handler(async ({ data }): Promise<CommentItem> => {
    if (!isCommentEntityType(data.entityType)) {
      throw new Error(`Unknown entity type: ${data.entityType}.`);
    }
    const actor = await requireProjectAccess(data.projectId);

    const body = data.body.trim();
    if (body.length === 0) throw new Error("Comment cannot be empty.");
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new Error(
        `Comment exceeds the ${MAX_COMMENT_LENGTH}-character limit.`,
      );
    }

    const parent = await readParentRecord(data.entityType, data.entityId);
    if (parent.projectId !== data.projectId) {
      throw new Error(
        `${data.entityType} #${data.entityId} does not belong to this project.`,
      );
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          entityType: data.entityType,
          entityId: data.entityId,
          projectId: data.projectId,
          body,
          authorId: actor.id,
          authorEmail: actor.email,
        },
      });
      // Look up everyone else who has commented on this record — the
      // thread participants. They get notified alongside the originator.
      // Read after the insert so the query plan is the same regardless of
      // how the engine schedules; the new comment is filtered by id.
      const priorAuthors = await tx.comment.findMany({
        where: {
          entityType: data.entityType,
          entityId: data.entityId,
          projectId: data.projectId,
          id: { not: created.id },
        },
        select: { authorId: true },
      });
      await emitCommentNotification(tx, {
        entityType: data.entityType,
        entityId: data.entityId,
        projectId: data.projectId,
        title: parent.title,
        message: `${actor.email} commented`,
        originatorId: parent.originatorId,
        actor,
        priorAuthorIds: priorAuthors.map((p) => p.authorId),
      });
      return created;
    });
    return toItem(row);
  });

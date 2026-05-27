import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { hasAtLeastRole } from "./users";
import { requireProjectAccess } from "./users.server";
import { recordUpdate } from "./audit.server";
import {
  buildStorageKey,
  deleteAttachmentFile,
  randomFileId,
  readAttachmentFile,
  validateUpload,
  writeAttachmentFile,
  MAX_ATTACHMENT_BYTES,
} from "./attachments.server";

/**
 * Attachments API — upload, list, download, delete files associated with a
 * CVR (ChangeLog) or FCO (FieldChangeOrder). Mirrors the audit module's
 * split: prisma + FS lives here; the pure validation / key-generation
 * helpers live in `attachments.server.ts`.
 *
 * Client transport: base64 over JSON. Capped at 25 MB raw (≈33 MB base64),
 * which fits both phone photos and scanned PDFs. If we ever need true
 * streaming for larger files, swap in a raw HTTP route.
 */

/** Parent-entity types attachments can hang off. */
export const ATTACHMENT_ENTITY_TYPES = [
  "ChangeLog",
  "FieldChangeOrder",
  "Rfi",
  "Trend",
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

function isAttachmentEntityType(s: string): s is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(s);
}

/** Public shape returned to the client — omits the on-disk `storageKey`. */
export type AttachmentItem = {
  id: number;
  entityType: AttachmentEntityType;
  entityId: number;
  projectId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: number;
  uploadedByEmail: string;
  createdAt: string;
};

type AttachmentRow = Awaited<
  ReturnType<typeof prisma.attachment.findMany>
>[number];

const toItem = (r: AttachmentRow): AttachmentItem => ({
  id: r.id,
  entityType: r.entityType as AttachmentEntityType,
  entityId: r.entityId,
  projectId: r.projectId,
  filename: r.filename,
  mimeType: r.mimeType,
  sizeBytes: r.sizeBytes,
  uploadedById: r.uploadedById,
  uploadedByEmail: r.uploadedByEmail,
  createdAt: r.createdAt.toISOString(),
});

/**
 * Confirms the (entityType, entityId) refers to a real record in the claimed
 * project. Prevents an attacker who has access to project A from attaching
 * to a CVR/FCO that actually belongs to project B.
 */
async function assertEntityInProject(
  entityType: AttachmentEntityType,
  entityId: number,
  projectId: number,
): Promise<void> {
  const row =
    entityType === "ChangeLog"
      ? await prisma.changeLog.findUnique({
          where: { id: entityId },
          select: { projectId: true },
        })
      : await prisma.fieldChangeOrder.findUnique({
          where: { id: entityId },
          select: { projectId: true },
        });
  if (!row) throw new Error(`${entityType} #${entityId} not found.`);
  if (row.projectId !== projectId) {
    throw new Error(`${entityType} #${entityId} does not belong to this project.`);
  }
}

export const fetchAttachments = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      entityType: string;
      entityId: number;
      projectId: number;
    }) => input,
  )
  .handler(async ({ data }): Promise<AttachmentItem[]> => {
    await requireProjectAccess(data.projectId);
    if (!isAttachmentEntityType(data.entityType)) return [];
    const rows = await prisma.attachment.findMany({
      where: {
        entityType: data.entityType,
        entityId: data.entityId,
        projectId: data.projectId,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toItem);
  });

export const attachmentsQueryOptions = (input: {
  entityType: AttachmentEntityType;
  entityId: number | null;
  projectId: number | null;
}) =>
  queryOptions({
    queryKey: ["attachments", input.entityType, input.entityId],
    queryFn: (): Promise<AttachmentItem[]> =>
      input.entityId === null || input.projectId === null
        ? Promise.resolve([])
        : fetchAttachments({
            data: {
              entityType: input.entityType,
              entityId: input.entityId,
              projectId: input.projectId,
            },
          }),
    enabled: input.entityId !== null && input.projectId !== null,
    staleTime: 30 * 1000,
  });

export type UploadAttachmentInput = {
  entityType: AttachmentEntityType;
  entityId: number;
  projectId: number;
  filename: string;
  mimeType: string;
  /** Raw file bytes, base64-encoded. */
  base64: string;
};

export const uploadAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: UploadAttachmentInput) => input)
  .handler(async ({ data }): Promise<AttachmentItem> => {
    if (!isAttachmentEntityType(data.entityType)) {
      throw new Error(`Unknown entity type: ${data.entityType}.`);
    }
    const actor = await requireProjectAccess(data.projectId);
    await assertEntityInProject(data.entityType, data.entityId, data.projectId);

    const buf = Buffer.from(data.base64, "base64");
    const sizeBytes = buf.length;
    const reason = validateUpload({ mimeType: data.mimeType, sizeBytes });
    if (reason !== null) throw new Error(reason);

    const storageKey = buildStorageKey({
      projectId: data.projectId,
      entityType: data.entityType,
      entityId: data.entityId,
      filename: data.filename,
      randomId: randomFileId(),
    });

    // Write the file first so it's on disk before the DB row references it.
    // If the DB write fails below, best-effort delete the orphan file. The
    // reverse order (DB row first, then write) would leave a dangling row.
    await writeAttachmentFile(storageKey, buf);

    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.attachment.create({
          data: {
            entityType: data.entityType,
            entityId: data.entityId,
            projectId: data.projectId,
            filename: data.filename,
            storageKey,
            mimeType: data.mimeType,
            sizeBytes,
            uploadedById: actor.id,
            uploadedByEmail: actor.email,
          },
        });
        // Surface the upload on the parent record's audit timeline — that's
        // where approvers actually look. A synthetic `attachment` field
        // reads cleanly: "Attachment: (empty) → drawing.pdf".
        await recordUpdate(
          tx,
          {
            entityType: data.entityType,
            entityId: data.entityId,
            projectId: data.projectId,
            actor,
          },
          [{ field: "attachment", oldValue: null, newValue: data.filename }],
        );
        return created;
      });
      return toItem(row);
    } catch (err) {
      // DB transaction failed — clean up the orphaned file on disk. Swallow
      // cleanup errors so the original DB error is what bubbles up.
      await deleteAttachmentFile(storageKey).catch(() => {});
      throw err;
    }
  });

export type DownloadAttachmentResult = {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Raw bytes, base64-encoded. Client decodes into a Blob to save. */
  base64: string;
};

export const downloadAttachment = createServerFn({ method: "GET" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<DownloadAttachmentResult> => {
    const row = await prisma.attachment.findUniqueOrThrow({
      where: { id: data.id },
    });
    await requireProjectAccess(row.projectId);
    const buf = await readAttachmentFile(row.storageKey);
    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      base64: buf.toString("base64"),
    };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const row = await prisma.attachment.findUniqueOrThrow({
      where: { id: data.id },
    });
    const actor = await requireProjectAccess(row.projectId);
    // Permission: the uploader can remove their own attachment; otherwise
    // requires ADMINISTRATOR. Approvers cannot delete other users' uploads.
    const isUploader = row.uploadedById === actor.id;
    const isAdmin = hasAtLeastRole(actor.role, "ADMINISTRATOR");
    if (!isUploader && !isAdmin) {
      throw new Error("Only the uploader or an administrator can delete this attachment.");
    }
    if (!isAttachmentEntityType(row.entityType)) {
      throw new Error(`Unknown entity type on attachment row: ${row.entityType}.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: row.id } });
      await recordUpdate(
        tx,
        {
          entityType: row.entityType,
          entityId: row.entityId,
          projectId: row.projectId,
          actor,
        },
        [{ field: "attachment", oldValue: row.filename, newValue: null }],
      );
    });
    // Remove the file last — if the DB transaction succeeded but the FS
    // delete fails, we've at least invalidated the reference and an admin
    // can sweep the orphan later. The opposite order would risk dangling
    // DB rows pointing at missing files.
    await deleteAttachmentFile(row.storageKey);
    return { ok: true };
  });

/** Re-export for client-side hints (used by the upload form). */
export { MAX_ATTACHMENT_BYTES };

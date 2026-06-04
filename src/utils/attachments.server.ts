import { randomBytes } from "node:crypto";
import { del as blobDel, put as blobPut } from "@vercel/blob";
import { MAX_ATTACHMENT_BYTES } from "./attachments";

/**
 * SERVER-ONLY storage layer for attachments. Two halves:
 *
 *   1. Pure helpers (`sanitizeFilename`, `buildStorageKey`, `validateUpload`,
 *      `randomFileId`) — no IO, directly unit-testable.
 *   2. Vercel-Blob-touching helpers (`writeAttachmentFile`,
 *      `readAttachmentFile`, `deleteAttachmentFile`) — talk to the
 *      `BLOB_READ_WRITE_TOKEN` store. The DB's `storageKey` column holds the
 *      full Blob URL returned by upload, not a relative path.
 *
 * Auth model: uploads use `addRandomSuffix: true`, so URLs are
 * unguessable. Downloads still flow through `downloadAttachment` (which
 * runs `requireProjectAccess`), so the URL never escapes to the browser
 * unless the caller is authorised — the random-suffix is just defence in
 * depth in case a URL leaks.
 *
 * NOTE: `MAX_ATTACHMENT_BYTES` is defined in `./attachments` (client-safe)
 * and re-exported below so callers / tests that already pull it from here
 * keep working. The constant has to live client-side too so the upload form
 * can validate before sending, and TanStack Start's import-protection bans
 * any client import of `*.server.*`.
 */

export { MAX_ATTACHMENT_BYTES };

/**
 * Allow-list of mime types accepted on upload. Permissive on purpose — EPC
 * field uploads include phone photos (heic/heif), scanned drawings (pdf),
 * marked-up sketches (png/jpg), Excel takeoffs, and the odd Word memo. The
 * size cap is the real first line of defence.
 */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/octet-stream",
]);

/**
 * Strips characters that are dangerous (path separators, NULs, control
 * chars), neutralises leading dots so uploads can't become hidden / config
 * files (`.htaccess`), collapses runs of whitespace, and caps the length.
 * The on-disk filename is the sanitised value prefixed with a random id so
 * collisions are impossible — sanitisation here is about safety + display,
 * not uniqueness.
 */
export function sanitizeFilename(raw: string): string {
  const stripped = raw
    // Strip leading dots / spaces / slashes first so "../foo" becomes "foo",
    // not "_foo". Order matters: do this before the in-string replacements
    // so the leading-strip regex sees the original characters.
    .replace(/^[.\s/\\]+/, "")
    // Path separators and control chars (NUL, \t, \n, …) anywhere else
    // become "_". They survive the leading strip only when embedded.
    .replace(/[\x00-\x1F/\\]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const capped = stripped.slice(0, 200);
  return capped || "untitled";
}

/**
 * Cryptographically-random id used as the on-disk filename prefix. Hex,
 * 16 chars (8 bytes of entropy — collision-resistant within a single
 * (project, entity) folder).
 */
export function randomFileId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Builds the storage key. Pure — `randomId` is an input so callers can
 * pass `randomFileId()` in real code and a fixed value in tests.
 *
 * Format: `attachments/{projectId}/{entityType}/{entityId}/{randomId}-{filename}`
 */
export function buildStorageKey(args: {
  projectId: number;
  entityType: string;
  entityId: number;
  filename: string;
  randomId: string;
}): string {
  const safe = sanitizeFilename(args.filename);
  return `attachments/${args.projectId}/${args.entityType}/${args.entityId}/${args.randomId}-${safe}`;
}

/**
 * Validates an upload's mime type and size. Returns `null` when the upload
 * is acceptable, or a user-facing error message otherwise.
 */
export function validateUpload(args: {
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (args.sizeBytes <= 0) return "File is empty.";
  if (args.sizeBytes > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return `File exceeds the ${mb} MB limit.`;
  }
  if (!ALLOWED_MIME_TYPES.has(args.mimeType)) {
    return `Files of type "${args.mimeType}" are not allowed.`;
  }
  return null;
}

/**
 * Uploads to Vercel Blob and returns the public URL — the caller stores
 * this URL as the row's `storageKey`. `addRandomSuffix: true` makes URLs
 * unguessable even when the pathname is predictable; combined with the
 * `randomFileId()` already baked into the pathname, the effective entropy
 * is high.
 *
 * Requires the `BLOB_READ_WRITE_TOKEN` env var (provided automatically when
 * a Vercel Blob store is connected to the project).
 */
export async function writeAttachmentFile(
  pathname: string,
  content: Buffer,
  contentType: string,
): Promise<string> {
  const result = await blobPut(pathname, content, {
    access: "public",
    addRandomSuffix: true,
    contentType,
  });
  return result.url;
}

/**
 * Fetches the blob via the URL stored as `storageKey`. We keep proxying
 * downloads through the server fn (rather than handing URLs to the browser)
 * so `requireProjectAccess` stays the single source of truth for
 * authorisation — the random-suffix URL is defence in depth, not the
 * primary control.
 */
export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  const res = await fetch(storageKey);
  if (!res.ok) {
    throw new Error(
      `Attachment fetch failed (${res.status} ${res.statusText}).`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Removes the blob. A missing object isn't fatal — the DB row delete still
 * proceeds. Any other error bubbles up so the caller surfaces it rather
 * than silently leaking an object.
 */
export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  try {
    await blobDel(storageKey);
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    // Vercel Blob throws a generic Error when the blob is already gone;
    // detect "not found" by message rather than a status code.
    if (/not\s+found/i.test(msg)) return;
    throw err;
  }
}

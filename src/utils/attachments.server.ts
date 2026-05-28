import { promises as fs } from "node:fs";
import * as nodePath from "node:path";
import { randomBytes } from "node:crypto";
import { MAX_ATTACHMENT_BYTES } from "./attachments";

/**
 * SERVER-ONLY local-filesystem storage for attachments. Two halves:
 *
 *   1. Pure helpers (`sanitizeFilename`, `buildStorageKey`, `validateUpload`,
 *      `randomFileId`) — no FS or DB dependency, directly unit-testable.
 *   2. FS-touching helpers (`writeAttachmentFile`, `readAttachmentFile`,
 *      `deleteAttachmentFile`) — read and write under the upload root.
 *
 * The upload root is resolved from `process.env.UPLOAD_DIR` (defaulting to
 * `./uploads` relative to the working directory). Every FS operation resolves
 * the storage key against that root AND asserts the result stays inside it,
 * so a malformed key can't escape via `..`.
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

/** Absolute path to the configured upload root. */
function getUploadRoot(): string {
  return nodePath.resolve(process.env.UPLOAD_DIR ?? "./uploads");
}

/**
 * Resolves a storage key to an absolute path, asserting the result is still
 * inside the upload root. Defends against `..` traversal in keys constructed
 * incorrectly.
 */
function resolveSafePath(storageKey: string): string {
  const root = getUploadRoot();
  const resolved = nodePath.resolve(root, storageKey);
  const rel = nodePath.relative(root, resolved);
  if (rel.startsWith("..") || nodePath.isAbsolute(rel)) {
    throw new Error("Invalid storage key: path escapes upload root.");
  }
  return resolved;
}

export async function writeAttachmentFile(
  storageKey: string,
  content: Buffer,
): Promise<void> {
  const abs = resolveSafePath(storageKey);
  await fs.mkdir(nodePath.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  const abs = resolveSafePath(storageKey);
  return fs.readFile(abs);
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  const abs = resolveSafePath(storageKey);
  try {
    await fs.unlink(abs);
  } catch (err) {
    // Missing file isn't fatal — the DB row deletion still proceeds. Any
    // other error (permissions, locked file) should bubble up so the caller
    // surfaces it rather than silently leaking a file on disk.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

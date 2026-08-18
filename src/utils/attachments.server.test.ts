import { beforeEach, describe, expect, it, vi } from "vitest";

// The three IO helpers talk to Vercel Blob. Replace the SDK with spies so we can
// assert the *private-access contract* (the security-relevant change) without a
// real store or `BLOB_READ_WRITE_TOKEN`. Hoisted so `vi.mock` (itself hoisted
// above the imports) can close over the handles.
const { blobPut, blobGet, blobDel } = vi.hoisted(() => ({
  blobPut: vi.fn(),
  blobGet: vi.fn(),
  blobDel: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({
  put: blobPut,
  get: blobGet,
  del: blobDel,
}));

import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  buildStorageKey,
  deleteAttachmentFile,
  readAttachmentFile,
  sanitizeFilename,
  validateUpload,
  writeAttachmentFile,
} from "./attachments.server";

describe("sanitizeFilename", () => {
  it("preserves an ordinary filename", () => {
    expect(sanitizeFilename("drawing.pdf")).toBe("drawing.pdf");
  });

  it("replaces path separators so an upload can't write outside its folder", () => {
    // "../" prefix is stripped (leading dots/slashes), then the remaining
    // internal slash becomes "_".
    expect(sanitizeFilename("../etc/passwd")).toBe("etc_passwd");
    expect(sanitizeFilename("a/b\\c.png")).toBe("a_b_c.png");
  });

  it("strips NUL and control characters", () => {
    expect(sanitizeFilename("file\x00name.txt")).toBe("file_name.txt");
    expect(sanitizeFilename("evil\x1F.png")).toBe("evil_.png");
  });

  it("strips leading dots so uploads can't become hidden config files", () => {
    expect(sanitizeFilename(".htaccess")).toBe("htaccess");
    expect(sanitizeFilename("...env")).toBe("env");
  });

  it("collapses internal whitespace runs", () => {
    // The tab becomes "_" (control char), then the spaces collapse.
    expect(sanitizeFilename("a   b\tc.txt")).toBe("a b_c.txt");
  });

  it('returns "untitled" when every character is stripped', () => {
    expect(sanitizeFilename("")).toBe("untitled");
    expect(sanitizeFilename("...")).toBe("untitled");
    expect(sanitizeFilename("///")).toBe("untitled");
  });

  it("replaces embedded NULs with underscores rather than the fallback name", () => {
    // The fallback only kicks in when nothing remains. NULs survive as
    // underscores, so the result is "__", not "untitled".
    expect(sanitizeFilename("\x00\x00")).toBe("__");
  });

  it("caps the result at a sane length", () => {
    const long = "a".repeat(500) + ".txt";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });
});

describe("buildStorageKey", () => {
  it("follows the documented layout", () => {
    expect(
      buildStorageKey({
        projectId: 7,
        entityType: "ChangeLog",
        entityId: 42,
        filename: "drawing.pdf",
        randomId: "abc123",
      }),
    ).toBe("attachments/7/ChangeLog/42/abc123-drawing.pdf");
  });

  it("applies sanitization to the filename portion", () => {
    expect(
      buildStorageKey({
        projectId: 1,
        entityType: "FieldChangeOrder",
        entityId: 9,
        filename: "../escape.png",
        randomId: "x",
      }),
    ).toBe("attachments/1/FieldChangeOrder/9/x-escape.png");
  });

  it("varies by entityType so a CVR and FCO with the same id don't collide", () => {
    const a = buildStorageKey({
      projectId: 1,
      entityType: "ChangeLog",
      entityId: 1,
      filename: "x.png",
      randomId: "r",
    });
    const b = buildStorageKey({
      projectId: 1,
      entityType: "FieldChangeOrder",
      entityId: 1,
      filename: "x.png",
      randomId: "r",
    });
    expect(a).not.toBe(b);
  });
});

describe("validateUpload", () => {
  it("accepts a reasonable image upload", () => {
    expect(
      validateUpload({ mimeType: "image/jpeg", sizeBytes: 1024 }),
    ).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ mimeType: "image/jpeg", sizeBytes: 0 })).toMatch(
      /empty/i,
    );
  });

  it("rejects a file over the size cap", () => {
    expect(
      validateUpload({
        mimeType: "image/jpeg",
        sizeBytes: MAX_ATTACHMENT_BYTES + 1,
      }),
    ).toMatch(/limit/i);
  });

  it("rejects a disallowed mime type", () => {
    expect(
      validateUpload({
        mimeType: "application/x-msdownload",
        sizeBytes: 100,
      }),
    ).toMatch(/not allowed/i);
  });

  it("the allow-list covers the EPC essentials", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/heic",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]) {
      expect(ALLOWED_MIME_TYPES.has(mime)).toBe(true);
    }
  });
});

describe("writeAttachmentFile", () => {
  beforeEach(() => blobPut.mockReset());

  it("uploads as a PRIVATE object with an unguessable suffix and returns the URL", async () => {
    blobPut.mockResolvedValue({ url: "https://blob.example/xyz-drawing.pdf" });
    const url = await writeAttachmentFile(
      "attachments/7/ChangeLog/42/abc-drawing.pdf",
      Buffer.from("PDF-BYTES"),
      "application/pdf",
    );

    expect(url).toBe("https://blob.example/xyz-drawing.pdf");
    // The regression this guards against is a silent revert to `access:"public"`,
    // which would make every leaked attachment URL readable without the token.
    expect(blobPut).toHaveBeenCalledWith(
      "attachments/7/ChangeLog/42/abc-drawing.pdf",
      expect.any(Buffer),
      { access: "private", addRandomSuffix: true, contentType: "application/pdf" },
    );
  });
});

describe("readAttachmentFile", () => {
  beforeEach(() => blobGet.mockReset());

  it("reads the private object with the store credentials and returns the bytes", async () => {
    blobGet.mockResolvedValue({
      statusCode: 200,
      stream: new Uint8Array([1, 2, 3, 4]),
    });
    const buf = await readAttachmentFile("https://blob.example/xyz");

    expect(buf).toEqual(Buffer.from([1, 2, 3, 4]));
    // Must pass `access:"private"` — a plain fetch (or public get) 403s on the
    // private object.
    expect(blobGet).toHaveBeenCalledWith("https://blob.example/xyz", {
      access: "private",
    });
  });

  it("throws when the blob is missing (get resolves null)", async () => {
    blobGet.mockResolvedValue(null);
    await expect(readAttachmentFile("gone")).rejects.toThrow(
      "Attachment not found in storage.",
    );
  });

  it("throws with the status when the fetch is non-200", async () => {
    blobGet.mockResolvedValue({ statusCode: 403, stream: new Uint8Array() });
    await expect(readAttachmentFile("forbidden")).rejects.toThrow(
      "Attachment fetch failed (status 403).",
    );
  });
});

describe("deleteAttachmentFile", () => {
  beforeEach(() => blobDel.mockReset());

  it("deletes the blob", async () => {
    blobDel.mockResolvedValue(undefined);
    await expect(deleteAttachmentFile("key")).resolves.toBeUndefined();
    expect(blobDel).toHaveBeenCalledWith("key");
  });

  // Use mockImplementationOnce (not the persistent mockImplementation) for the
  // throwing cases: a throwing impl left on the spy lingers in its call-tracking
  // state and Vitest's async unhandled-rejection detector flags it during the
  // *next* test — failing both, even though `deleteAttachmentFile` catches the
  // error here. The "once" impl is consumed by the single call and leaves
  // nothing behind. (The resolve cases above don't need this — a resolved mock
  // never trips the detector.)
  it("treats an already-gone blob as non-fatal so the row delete still proceeds", async () => {
    blobDel.mockImplementationOnce(() => {
      throw new Error("Vercel Blob: blob not found");
    });
    await expect(deleteAttachmentFile("key")).resolves.toBeUndefined();
  });

  it("rethrows any other error rather than silently leaking the object", async () => {
    blobDel.mockImplementationOnce(() => {
      throw new Error("network timeout");
    });
    await expect(deleteAttachmentFile("key")).rejects.toThrow("network timeout");
  });
});

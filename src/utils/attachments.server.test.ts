import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  buildStorageKey,
  sanitizeFilename,
  validateUpload,
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

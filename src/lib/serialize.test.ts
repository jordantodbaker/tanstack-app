import { describe, expect, it } from "vitest";
import { serializeDate, serializeDateFields } from "./serialize";

describe("serializeDate", () => {
  it("converts a Date to an ISO string", () => {
    expect(serializeDate(new Date("2026-08-13T09:30:00.000Z"))).toBe(
      "2026-08-13T09:30:00.000Z",
    );
  });

  it("passes null through", () => {
    expect(serializeDate(null)).toBeNull();
  });
});

describe("serializeDateFields", () => {
  type Row = {
    id: number;
    createdAt: Date;
    updatedAt: Date;
    dueDate: Date | null;
    approvedAt: Date | null;
  };

  const row: Row = {
    id: 1,
    createdAt: new Date("2026-08-13T09:30:00.000Z"),
    updatedAt: new Date("2026-08-13T10:00:00.000Z"),
    dueDate: new Date("2026-08-20T00:00:00.000Z"),
    approvedAt: null,
  };

  it("serializes iso fields to strings and nullable fields null-safely", () => {
    const patch = serializeDateFields(row, {
      iso: ["createdAt", "updatedAt"],
      nullable: ["dueDate", "approvedAt"],
    });
    expect(patch).toEqual({
      createdAt: "2026-08-13T09:30:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
      dueDate: "2026-08-20T00:00:00.000Z",
      approvedAt: null,
    });
  });

  it("produces a patch that overrides the raw Date fields when spread", () => {
    const dto = { ...row, ...serializeDateFields(row, {
      iso: ["createdAt", "updatedAt"],
      nullable: ["dueDate", "approvedAt"],
    }) };
    expect(dto.id).toBe(1);
    expect(typeof dto.createdAt).toBe("string");
    expect(dto.approvedAt).toBeNull();
  });

  it("constrains field lists to real Date columns at compile time", () => {
    // Compile-time-only: this closure is never called, so the runtime
    // `.toISOString()` on a non-Date never happens. `tsc` still checks its body,
    // and a passing typecheck means each `@ts-expect-error` fired — i.e. the
    // constraint rejected the bad field name. If a directive stopped firing,
    // `tsc` would flag the now-unused `@ts-expect-error`.
    const typeChecks = () => {
      // @ts-expect-error `id` is a number, not a Date column
      serializeDateFields(row, { iso: ["id"], nullable: [] });
      // @ts-expect-error `createdAt` is a non-null Date — it can't be nullable
      serializeDateFields(row, { iso: [], nullable: ["createdAt"] });
    };
    expect(typeof typeChecks).toBe("function");
  });
});

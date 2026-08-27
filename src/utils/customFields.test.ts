import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * Definition CRUD for user-defined take-off columns.
 *
 * The slot IS the storage, so the tests that matter are about allocation
 * rather than plumbing: a recycled slot must not leak the previous column's
 * values into a new one, and a rename must never touch row data.
 */
const {
  prismaMock,
  transaction,
  requireProjectAccessFn,
  auditCreate,
  auditCreateMany,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireProjectAccessFn: vi.fn(),
  auditCreate: vi.fn(),
  auditCreateMany: vi.fn(),
  prismaMock: {
    customFieldDef: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    fefRow: { updateMany: vi.fn() },
    auditEvent: { create: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../server/db", () => ({ prisma: prismaMock }));
vi.mock("./users.server", () => ({
  requireProjectAccess: requireProjectAccessFn,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const builder = {
      inputValidator(v: (d: unknown) => unknown) {
        validate = v;
        return builder;
      },
      handler(h: (args: { data: unknown }) => unknown) {
        return async (args?: { data: unknown }) => h({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

import {
  addCustomFieldDef,
  clearCustomFieldData,
  removeCustomFieldDef,
  renameCustomFieldDef,
  reorderCustomFieldDefs,
} from "./customFields";

const approver: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "a@x.com",
  role: "APPROVER",
};
const plainUser: CurrentUser = { ...approver, role: "USER" };

const def = (over = {}) => ({
  id: 1,
  discipline: "piping",
  slot: 1,
  label: "Client Tag",
  position: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireProjectAccessFn.mockResolvedValue(approver);
  prismaMock.auditEvent.create = auditCreate;
  prismaMock.auditEvent.createMany = auditCreateMany;
  auditCreate.mockResolvedValue({});
  auditCreateMany.mockResolvedValue({ count: 1 });
  prismaMock.customFieldDef.findMany.mockResolvedValue([]);
  prismaMock.customFieldDef.create.mockResolvedValue(def());
  prismaMock.customFieldDef.update.mockResolvedValue(def());
  prismaMock.customFieldDef.delete.mockResolvedValue({});
  prismaMock.customFieldDef.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    projectId: 42,
    discipline: "piping",
    slot: 3,
    label: "Client Tag",
  });
  prismaMock.fefRow.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.$transaction = transaction;
  transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fn: (t: any) => Promise<unknown>) => fn(prismaMock),
  );
});

describe("addCustomFieldDef", () => {
  const run = (label = "Client Tag") =>
    addCustomFieldDef({ data: { projectId: 42, discipline: "piping", label } });

  it("allocates the lowest free slot and resolves its storage field", async () => {
    prismaMock.customFieldDef.findMany.mockResolvedValue([
      { slot: 1, position: 0 },
      { slot: 3, position: 1 },
    ]);
    prismaMock.customFieldDef.create.mockResolvedValue(def({ slot: 2 }));

    const out = await run();

    expect(prismaMock.customFieldDef.create.mock.calls[0][0].data).toMatchObject({
      slot: 2,
      position: 2,
    });
    expect(out.field).toBe("custom2");
  });

  it("CLEARS the allocated slot before creating the column", async () => {
    // The hazard this guards: remove "Client Tag" (slot 2), add "Heat Number",
    // get slot 2 back — and without the clear, the new column shows the old
    // column's values down every row.
    prismaMock.customFieldDef.findMany.mockResolvedValue([{ slot: 1, position: 0 }]);
    prismaMock.customFieldDef.create.mockResolvedValue(def({ slot: 2 }));

    await run("Heat Number");

    expect(prismaMock.fefRow.updateMany).toHaveBeenCalledWith({
      where: { projectId: 42, discipline: "piping" },
      data: { custom2: "" },
    });
  });

  it("refuses once every slot is taken", async () => {
    prismaMock.customFieldDef.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ slot: i + 1, position: i })),
    );
    await expect(run()).rejects.toThrow(/maximum of 10 custom columns/);
    expect(prismaMock.customFieldDef.create).not.toHaveBeenCalled();
    // And nothing was wiped on the way to failing.
    expect(prismaMock.fefRow.updateMany).not.toHaveBeenCalled();
  });

  it("normalizes the label before storing it", async () => {
    await run("  Client\n Tag  ");
    expect(prismaMock.customFieldDef.create.mock.calls[0][0].data.label).toBe(
      "Client Tag",
    );
  });

  it("rejects a label with nothing in it", async () => {
    await expect(run("   ")).rejects.toThrow(/Give the column a name/);
  });

  it("requires APPROVER", async () => {
    requireProjectAccessFn.mockResolvedValue(plainUser);
    await expect(run()).rejects.toThrow(/APPROVER/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("audits the new definition", async () => {
    await run();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "CustomFieldDef",
        action: "CREATE",
        projectId: 42,
      }),
    });
  });
});

describe("renameCustomFieldDef", () => {
  const run = (label = "Client Tag Rev B") =>
    renameCustomFieldDef({ data: { id: 1, label } });

  it("writes the label and nothing else", async () => {
    await run();
    expect(prismaMock.customFieldDef.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { label: "Client Tag Rev B" },
      select: expect.anything(),
    });
    // The data lives in the row column; a rename must never rewrite rows.
    expect(prismaMock.fefRow.updateMany).not.toHaveBeenCalled();
  });

  it("authorizes against the definition's own project", async () => {
    await run();
    expect(requireProjectAccessFn).toHaveBeenCalledWith(42);
  });

  it("records the old and new label", async () => {
    await run();
    const rows = auditCreateMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      field: "label",
      oldValue: "Client Tag",
      newValue: "Client Tag Rev B",
    });
  });

  it("rejects a blank rename", async () => {
    await expect(run("  ")).rejects.toThrow(/Give the column a name/);
  });
});

describe("removeCustomFieldDef", () => {
  const run = () => removeCustomFieldDef({ data: { id: 1 } });

  it("deletes the definition and LEAVES the row values alone", async () => {
    // Removing is cheap and reversible up until the slot is reallocated;
    // `addCustomFieldDef` is what clears a recycled slot.
    await expect(run()).resolves.toEqual({ ok: true });
    expect(prismaMock.customFieldDef.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(prismaMock.fefRow.updateMany).not.toHaveBeenCalled();
  });

  it("requires APPROVER", async () => {
    requireProjectAccessFn.mockResolvedValue(plainUser);
    await expect(run()).rejects.toThrow(/APPROVER/);
    expect(prismaMock.customFieldDef.delete).not.toHaveBeenCalled();
  });
});

describe("clearCustomFieldData", () => {
  const run = () => clearCustomFieldData({ data: { id: 1 } });

  it("blanks the definition's slot across the discipline's rows", async () => {
    prismaMock.fefRow.updateMany.mockResolvedValue({ count: 17 });
    const out = await run();
    expect(prismaMock.fefRow.updateMany).toHaveBeenCalledWith({
      where: { projectId: 42, discipline: "piping" },
      data: { custom3: "" },
    });
    expect(out).toEqual({ rowsCleared: 17 });
  });

  it("keeps the column — only its data goes", async () => {
    await run();
    expect(prismaMock.customFieldDef.delete).not.toHaveBeenCalled();
  });

  it("records how much was cleared", async () => {
    prismaMock.fefRow.updateMany.mockResolvedValue({ count: 17 });
    await run();
    expect(auditCreateMany.mock.calls[0][0].data[0].note).toMatch(
      /Cleared the "Client Tag" column across 17 row/,
    );
  });
});

describe("reorderCustomFieldDefs", () => {
  const run = (orderedIds: number[]) =>
    reorderCustomFieldDefs({
      data: { projectId: 42, discipline: "piping", orderedIds },
    });

  it("renumbers positions in the given order", async () => {
    prismaMock.customFieldDef.findMany
      .mockResolvedValueOnce([{ id: 5 }, { id: 9 }])
      .mockResolvedValueOnce([def({ id: 9, position: 0 }), def({ id: 5, position: 1 })]);

    await run([9, 5]);

    expect(prismaMock.customFieldDef.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { position: 0 },
    });
    expect(prismaMock.customFieldDef.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { position: 1 },
    });
  });

  it("ignores an id that is no longer a definition", async () => {
    // A column removed in another tab between the drag and the drop.
    prismaMock.customFieldDef.findMany
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([def({ id: 5 })]);

    await run([99, 5]);

    expect(prismaMock.customFieldDef.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.customFieldDef.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { position: 0 },
    });
  });

  it("requires APPROVER", async () => {
    requireProjectAccessFn.mockResolvedValue(plainUser);
    await expect(run([5])).rejects.toThrow(/APPROVER/);
  });
});

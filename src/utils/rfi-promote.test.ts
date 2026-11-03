import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * `promoteRfiToFco` — the one promote flow that mints its target inline
 * rather than through `promote.server`. Pins what the new FCO carries from
 * the RFI, that both timelines are audited, and that the RFI is read and the
 * project check made INSIDE the transaction, as the entity writes do.
 */
const {
  prismaMock,
  tx,
  requireUserFn,
  assertProjectAccessFn,
  allocateEntityNumberFn,
  recordCreateFn,
  recordUpdateFn,
} = vi.hoisted(() => {
  const tx = {
    rfi: { findUniqueOrThrow: vi.fn() },
    fieldChangeOrder: { create: vi.fn() },
  };
  return {
    tx,
    requireUserFn: vi.fn(),
    assertProjectAccessFn: vi.fn(),
    allocateEntityNumberFn: vi.fn(),
    recordCreateFn: vi.fn(),
    recordUpdateFn: vi.fn(),
    prismaMock: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("../server/db", () => ({ prisma: prismaMock }));
vi.mock("./users.server", () => ({
  requireUser: requireUserFn,
  assertProjectAccess: assertProjectAccessFn,
  projectIdScopedHandler: (h: unknown) => h,
}));
vi.mock("./entityNumbers.server", () => ({
  allocateEntityNumber: allocateEntityNumberFn,
}));
vi.mock("./audit.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./audit.server")>()),
  recordCreate: recordCreateFn,
  recordUpdate: recordUpdateFn,
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
        return async (args?: { data: unknown }) =>
          h({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

import { promoteRfiToFco } from "./rfis";

const user: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "u@x.com",
  role: "USER",
};

const rfi = (over: Record<string, unknown> = {}) => ({
  id: 21,
  projectId: 3,
  rfiNumber: "RFI-021",
  subject: "Clarify anchor bolt pattern",
  question: "Drawing S-101 shows 4 bolts; spec says 6.",
  priority: "HIGH",
  discipline: "steel",
  cbsCodes: ["331-10-0000-00-L"],
  locationArea: "Area 2",
  drawingRefs: ["S-101"],
  ...over,
});

const promote = () => promoteRfiToFco({ data: { rfiId: 21 } });

beforeEach(() => {
  vi.clearAllMocks();
  requireUserFn.mockResolvedValue(user);
  assertProjectAccessFn.mockResolvedValue(undefined);
  allocateEntityNumberFn.mockResolvedValue("FCO-010");
  tx.rfi.findUniqueOrThrow.mockResolvedValue(rfi());
  tx.fieldChangeOrder.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 55,
      ...data,
    }),
  );
});

describe("promoteRfiToFco", () => {
  it("mints an FCO from the RFI, numbered from the project sequence, and links it back", async () => {
    await expect(promote()).resolves.toEqual({ fcoId: 55 });
    expect(allocateEntityNumberFn).toHaveBeenCalledWith(
      tx,
      3,
      "FieldChangeOrder",
    );
    expect(tx.fieldChangeOrder.create.mock.calls[0][0].data).toMatchObject({
      projectId: 3,
      fcoNumber: "FCO-010",
      title: "Clarify anchor bolt pattern",
      description: "Drawing S-101 shows 4 bolts; spec says 6.",
      originType: "RFI_RESPONSE",
      priority: "HIGH",
      discipline: "steel",
      cbsCodes: ["331-10-0000-00-L"],
      locationArea: "Area 2",
      drawingRefs: ["S-101"],
      rfiNumbers: ["RFI-021"],
      initiatedBy: "u@x.com",
      linkedRfiId: 21,
      createdById: 7,
    });
  });

  it.each([
    ["URGENT", "URGENT"],
    ["HIGH", "HIGH"],
    ["NORMAL", "NORMAL"],
    ["LOW", "LOW"],
  ])("carries a %s RFI over as a %s FCO", async (from, to) => {
    tx.rfi.findUniqueOrThrow.mockResolvedValue(rfi({ priority: from }));
    await promote();
    expect(tx.fieldChangeOrder.create.mock.calls[0][0].data).toMatchObject({
      priority: to,
    });
  });

  it("audits the new FCO and notes the promotion on the RFI's timeline", async () => {
    await promote();
    expect(recordCreateFn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entityType: "FieldChangeOrder",
        entityId: 55,
        projectId: 3,
        actor: user,
      }),
    );
    expect(recordUpdateFn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ entityType: "Rfi", entityId: 21 }),
      [{ field: "linkedFcos", oldValue: null, newValue: "FCO-010" }],
    );
  });

  it("checks project access inside the transaction, before minting anything", async () => {
    assertProjectAccessFn.mockRejectedValue(new Error("Forbidden"));
    await expect(promote()).rejects.toThrow("Forbidden");
    expect(assertProjectAccessFn).toHaveBeenCalledWith(user, 3);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.fieldChangeOrder.create).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller without opening a transaction", async () => {
    requireUserFn.mockRejectedValue(new Error("Unauthorized: not signed in"));
    await expect(promote()).rejects.toThrow("Unauthorized");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, it, expect, vi } from "vitest";
import type { CurrentUser } from "./users";

const { prismaMock, tx, requireProjectAccessFn, createLinkedCvrFn } =
  vi.hoisted(() => {
    const tx = {
      fieldChangeOrder: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    };
    return {
      tx,
      requireProjectAccessFn: vi.fn(),
      createLinkedCvrFn: vi.fn(),
      prismaMock: {
        fieldChangeOrder: { findUniqueOrThrow: vi.fn() },
        $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    };
  });

vi.mock("../server/db", () => ({ prisma: prismaMock }));
vi.mock("./users.server", () => ({
  requireProjectAccess: requireProjectAccessFn,
  projectIdScopedHandler: (h: unknown) => h,
}));
vi.mock("./promote.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./promote.server")>()),
  createLinkedCvr: createLinkedCvrFn,
}));
vi.mock("./audit.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./audit.server")>()),
  recordUpdate: vi.fn(),
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

import {
  priorityToRiskLevel,
  FCO_PRIORITIES,
  promoteFcoToCvr,
} from "./fcoLog";

describe("priorityToRiskLevel", () => {
  it("maps each FCO priority to the CVR risk level it escalates into", () => {
    expect(priorityToRiskLevel("URGENT")).toBe("CRITICAL");
    expect(priorityToRiskLevel("HIGH")).toBe("HIGH");
    expect(priorityToRiskLevel("LOW")).toBe("LOW");
    expect(priorityToRiskLevel("NORMAL")).toBe("MEDIUM");
  });

  it("returns a value for every defined priority (nothing falls through)", () => {
    for (const p of FCO_PRIORITIES) {
      expect(priorityToRiskLevel(p)).toBeTruthy();
    }
  });
});

describe("promoteFcoToCvr", () => {
  const user: CurrentUser = {
    id: 7,
    clerkId: "c7",
    email: "u@x.com",
    role: "USER",
  };
  const fco = (over = {}) => ({
    id: 5,
    projectId: 3,
    fcoNumber: "FCO-005",
    title: "Reroute line",
    description: "",
    reasonNarrative: "",
    status: "SUBMITTED",
    linkedCvrId: null as number | null,
    discipline: "piping",
    cbsCodes: [],
    initiatedBy: "u@x.com",
    estimatedCost: 0,
    estimatedHours: 0,
    priority: "NORMAL",
    originType: "FIELD_CONDITION",
    locationArea: "",
    ...over,
  });
  const promote = () => promoteFcoToCvr({ data: { fcoId: 5 } });

  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccessFn.mockResolvedValue(user);
    createLinkedCvrFn.mockResolvedValue({ id: 99, projectId: 3 });
    tx.fieldChangeOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.fieldChangeOrder.findUniqueOrThrow.mockResolvedValue(
      fco({ linkedCvrId: 99, status: "LINKED_TO_CVR" }),
    );
  });

  it("links the new CVR and returns its id", async () => {
    prismaMock.fieldChangeOrder.findUniqueOrThrow.mockResolvedValue(fco());
    await expect(promote()).resolves.toEqual({ cvrId: 99 });
    expect(requireProjectAccessFn).toHaveBeenCalledWith(3);
    // The link is conditional on the FCO still being unlinked.
    expect(tx.fieldChangeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 5, linkedCvrId: null },
      data: { linkedCvrId: 99, status: "LINKED_TO_CVR" },
    });
  });

  it("refuses an FCO that is already linked, before minting a CVR", async () => {
    prismaMock.fieldChangeOrder.findUniqueOrThrow.mockResolvedValue(
      fco({ linkedCvrId: 42 }),
    );
    await expect(promote()).rejects.toThrow(/already been promoted/);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it.each(["VOID", "REJECTED"])("refuses a %s FCO", async (status) => {
    prismaMock.fieldChangeOrder.findUniqueOrThrow.mockResolvedValue(
      fco({ status }),
    );
    await expect(promote()).rejects.toThrow(/Cannot promote/);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it("throws when a concurrent promote linked it first, rolling back", async () => {
    // Passed the pre-check, but the other request's link landed first.
    prismaMock.fieldChangeOrder.findUniqueOrThrow.mockResolvedValue(fco());
    tx.fieldChangeOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(promote()).rejects.toThrow(/already been promoted/);
    // Thrown inside the transaction, so Prisma discards the minted CVR.
    expect(tx.fieldChangeOrder.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("checks project access before doing anything", async () => {
    prismaMock.fieldChangeOrder.findUniqueOrThrow.mockResolvedValue(fco());
    requireProjectAccessFn.mockRejectedValue(new Error("Forbidden"));
    await expect(promote()).rejects.toThrow("Forbidden");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * `promoteTrendToCvr` — who may promote, which trends may be promoted, and
 * that two promotes racing on one trend can't both mint a CVR. Prisma and the
 * CVR minting are faked; `claimPromotion` is the real one.
 */
const { prismaMock, tx, requireProjectAccessFn, createLinkedCvrFn, recordUpdateFn } =
  vi.hoisted(() => {
    const tx = { trend: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() } };
    return {
      tx,
      requireProjectAccessFn: vi.fn(),
      createLinkedCvrFn: vi.fn(),
      recordUpdateFn: vi.fn(),
      prismaMock: {
        trend: { findUniqueOrThrow: vi.fn() },
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

import { promoteTrendToCvr } from "./trends";

const approver: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "approver@x.com",
  role: "APPROVER",
};

const trend = (over: Record<string, unknown> = {}) => ({
  id: 12,
  projectId: 3,
  trendNumber: "TR-012",
  title: "Steel price drift",
  description: "",
  status: "PROBABLE",
  discipline: "steel",
  cbsCodes: [],
  costLikely: 25_000,
  scheduleDaysImpact: 4,
  neededBy: null,
  locationArea: "",
  linkedCvrId: null as number | null,
  closedAt: null,
  // Someone else raised it, so the approver may promote it.
  createdById: 99,
  ...over,
});

const promote = () => promoteTrendToCvr({ data: { trendId: 12 } });

beforeEach(() => {
  vi.clearAllMocks();
  requireProjectAccessFn.mockResolvedValue(approver);
  createLinkedCvrFn.mockResolvedValue({ id: 88, projectId: 3 });
  tx.trend.updateMany.mockResolvedValue({ count: 1 });
  tx.trend.findUniqueOrThrow.mockResolvedValue(
    trend({ status: "CONVERTED", linkedCvrId: 88 }),
  );
  prismaMock.trend.findUniqueOrThrow.mockResolvedValue(trend());
});

describe("promoteTrendToCvr", () => {
  it("mints a CVR carrying the likely cost, links it and converts the trend", async () => {
    await expect(promote()).resolves.toEqual({ cvrId: 88 });
    expect(requireProjectAccessFn).toHaveBeenCalledWith(3);
    expect(createLinkedCvrFn.mock.calls[0][3]).toMatchObject({
      title: "Steel price drift",
      costImpact: 25_000,
      scheduleDaysImpact: 4,
      originator: "approver@x.com",
    });
    // The conversion is conditional on the trend still being unconverted.
    expect(tx.trend.updateMany).toHaveBeenCalledWith({
      where: { id: 12, linkedCvrId: null, status: { not: "CONVERTED" } },
      data: expect.objectContaining({ status: "CONVERTED", linkedCvrId: 88 }),
    });
    // And the flip is on the trend's own audit trail.
    expect(recordUpdateFn).toHaveBeenCalledTimes(1);
  });

  it("throws when a concurrent promote converted it first, rolling back", async () => {
    // Passed the status check, but the other request's update landed first.
    tx.trend.updateMany.mockResolvedValue({ count: 0 });
    await expect(promote()).rejects.toThrow(/already been promoted/);
    // Thrown inside the transaction, so Prisma discards the minted CVR.
    expect(createLinkedCvrFn).toHaveBeenCalledTimes(1);
    expect(tx.trend.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(recordUpdateFn).not.toHaveBeenCalled();
  });

  it("refuses a trend that is already converted, before minting a CVR", async () => {
    prismaMock.trend.findUniqueOrThrow.mockResolvedValue(
      trend({ status: "CONVERTED", linkedCvrId: 41 }),
    );
    await expect(promote()).rejects.toThrow(/already been promoted/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each(["VOID", "REJECTED"])("refuses a %s trend", async (status) => {
    prismaMock.trend.findUniqueOrThrow.mockResolvedValue(trend({ status }));
    await expect(promote()).rejects.toThrow(/Cannot promote/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a plain USER — Approver or higher only", async () => {
    requireProjectAccessFn.mockResolvedValue({ ...approver, role: "USER" });
    await expect(promote()).rejects.toThrow(/Approver role/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets an ADMINISTRATOR promote", async () => {
    requireProjectAccessFn.mockResolvedValue({
      ...approver,
      role: "ADMINISTRATOR",
    });
    await expect(promote()).resolves.toEqual({ cvrId: 88 });
  });

  it("refuses the trend's own originator", async () => {
    prismaMock.trend.findUniqueOrThrow.mockResolvedValue(
      trend({ createdById: approver.id }),
    );
    await expect(promote()).rejects.toThrow(/originator cannot promote/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets an approver promote a trend with no recorded originator", async () => {
    prismaMock.trend.findUniqueOrThrow.mockResolvedValue(
      trend({ createdById: null }),
    );
    await expect(promote()).resolves.toEqual({ cvrId: 88 });
  });

  it("checks project access before anything else", async () => {
    requireProjectAccessFn.mockRejectedValue(new Error("Forbidden"));
    await expect(promote()).rejects.toThrow("Forbidden");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

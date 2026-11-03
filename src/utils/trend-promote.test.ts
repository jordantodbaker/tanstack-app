import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * `promoteTrendToCvr` — who may promote, which trends may be promoted, and
 * that two promotes racing on one trend can't both mint a CVR. Prisma and the
 * CVR minting are faked; `claimPromotion` is the real one.
 *
 * The trend is read and the project check made INSIDE the transaction, as
 * the entity writes do. The first read in the transaction is the trend; the
 * second, after the conversion, is the re-read for the audit diff.
 */
const {
  prismaMock,
  tx,
  requireUserFn,
  assertProjectAccessFn,
  createLinkedCvrFn,
  recordUpdateFn,
} = vi.hoisted(() => {
  const tx = { trend: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() } };
  return {
    tx,
    requireUserFn: vi.fn(),
    assertProjectAccessFn: vi.fn(),
    createLinkedCvrFn: vi.fn(),
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
/** The trend the transaction reads first; the re-read after conversion follows. */
const given = (row: ReturnType<typeof trend>) =>
  tx.trend.findUniqueOrThrow.mockResolvedValueOnce(row);

beforeEach(() => {
  vi.clearAllMocks();
  requireUserFn.mockResolvedValue(approver);
  assertProjectAccessFn.mockResolvedValue(undefined);
  createLinkedCvrFn.mockResolvedValue({ id: 88, projectId: 3 });
  tx.trend.updateMany.mockResolvedValue({ count: 1 });
  tx.trend.findUniqueOrThrow.mockResolvedValue(
    trend({ status: "CONVERTED", linkedCvrId: 88 }),
  );
});

describe("promoteTrendToCvr", () => {
  it("mints a CVR carrying the likely cost, links it and converts the trend", async () => {
    given(trend());
    await expect(promote()).resolves.toEqual({ cvrId: 88 });
    expect(assertProjectAccessFn).toHaveBeenCalledWith(approver, 3);
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
    given(trend());
    tx.trend.updateMany.mockResolvedValue({ count: 0 });
    await expect(promote()).rejects.toThrow(/already been promoted/);
    // Thrown inside the transaction, so Prisma discards the minted CVR; the
    // only read was the trend itself, never the post-conversion re-read.
    expect(createLinkedCvrFn).toHaveBeenCalledTimes(1);
    expect(tx.trend.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(recordUpdateFn).not.toHaveBeenCalled();
  });

  it("refuses a trend that is already converted, before minting a CVR", async () => {
    given(trend({ status: "CONVERTED", linkedCvrId: 41 }));
    await expect(promote()).rejects.toThrow(/already been promoted/);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it.each(["VOID", "REJECTED"])("refuses a %s trend", async (status) => {
    given(trend({ status }));
    await expect(promote()).rejects.toThrow(/Cannot promote/);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it("refuses a plain USER — Approver or higher only", async () => {
    given(trend());
    requireUserFn.mockResolvedValue({ ...approver, role: "USER" });
    await expect(promote()).rejects.toThrow(/requires APPROVER/);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it("lets an ADMINISTRATOR promote", async () => {
    given(trend());
    requireUserFn.mockResolvedValue({ ...approver, role: "ADMINISTRATOR" });
    await expect(promote()).resolves.toEqual({ cvrId: 88 });
  });

  it("refuses the trend's own originator", async () => {
    given(trend({ createdById: approver.id }));
    await expect(promote()).rejects.toThrow(/originator cannot promote/);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it("lets an approver promote a trend with no recorded originator", async () => {
    given(trend({ createdById: null }));
    await expect(promote()).resolves.toEqual({ cvrId: 88 });
  });

  it("checks project access inside the transaction, before anything else", async () => {
    given(trend());
    assertProjectAccessFn.mockRejectedValue(new Error("Forbidden"));
    await expect(promote()).rejects.toThrow("Forbidden");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(createLinkedCvrFn).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller without opening a transaction", async () => {
    requireUserFn.mockRejectedValue(new Error("Unauthorized: not signed in"));
    await expect(promote()).rejects.toThrow("Unauthorized");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

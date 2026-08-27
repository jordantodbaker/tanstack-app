import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * Freezing materializes the effective rate book into a scope so later global
 * rate changes cannot reach it. The behaviors worth pinning are the ones that
 * would silently reprice an issued estimate if they broke:
 *
 *  - the FULL book is written, not just the roles a sheet happens to use;
 *  - a project's deliberate overrides WIN over the global book being copied
 *    down, so freezing never undoes a negotiated rate;
 *  - re-freezing an already-frozen scope is refused rather than silently
 *    re-materializing at today's numbers.
 */
const {
  prismaMock,
  transaction,
  requireProjectAccessFn,
  requireAdminFn,
  auditCreateMany,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireProjectAccessFn: vi.fn(),
  requireAdminFn: vi.fn(),
  auditCreateMany: vi.fn(),
  prismaMock: {
    estimateVersion: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    project: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    roleRate: { findMany: vi.fn() },
    projectRoleRate: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    versionRoleRate: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    auditEvent: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../server/db", () => ({ prisma: prismaMock }));

vi.mock("./users.server", () => ({
  requireProjectAccess: requireProjectAccessFn,
  requireAdmin: requireAdminFn,
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
  freezeProjectRates,
  freezeVersionRates,
  unfreezeProjectRates,
  unfreezeVersionRates,
} from "./rateFreeze";

const approver: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "approver@example.com",
  role: "APPROVER",
};
const plainUser: CurrentUser = { ...approver, role: "USER" };
const admin: CurrentUser = { ...approver, role: "ADMINISTRATOR" };

/** Global book: two roles, one with two schedules. */
const GLOBAL = [
  { roleId: 1, schedule: "ST", rate: 68 },
  { roleId: 1, schedule: "OT", rate: 92 },
  { roleId: 2, schedule: "ST", rate: 91 },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireProjectAccessFn.mockResolvedValue(approver);
  requireAdminFn.mockResolvedValue(admin);
  prismaMock.auditEvent.createMany = auditCreateMany;
  auditCreateMany.mockResolvedValue({ count: 1 });

  prismaMock.estimateVersion.findUniqueOrThrow.mockResolvedValue({
    projectId: 42,
    ratesFrozenAt: null,
  });
  prismaMock.project.findUniqueOrThrow.mockResolvedValue({
    ratesFrozenAt: null,
  });
  prismaMock.roleRate.findMany.mockResolvedValue(GLOBAL);
  prismaMock.projectRoleRate.findMany.mockResolvedValue([]);
  prismaMock.versionRoleRate.createMany.mockResolvedValue({ count: 0 });
  prismaMock.projectRoleRate.createMany.mockResolvedValue({ count: 0 });
  prismaMock.versionRoleRate.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.estimateVersion.update.mockResolvedValue({});
  prismaMock.project.update.mockResolvedValue({});

  prismaMock.$transaction = transaction;
  transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fn: (t: any) => Promise<unknown>) => fn(prismaMock),
  );
});

describe("freezeVersionRates", () => {
  const run = () => freezeVersionRates({ data: { versionId: 5 } });

  it("materializes the FULL effective book, not just roles in use", async () => {
    const out = await run();

    // Three (role, schedule) pairs exist globally; all three are written even
    // though the sheet may only use one. A partial freeze would let a new line
    // for an unfrozen craft price at a future global rate.
    expect(out.ratesFrozen).toBe(3);
    const rows = prismaMock.versionRoleRate.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual({ versionId: 5, roleId: 1, schedule: "OT", rate: 92 });
  });

  it("lets a project override win over the global rate being copied", async () => {
    prismaMock.projectRoleRate.findMany.mockResolvedValue([
      { roleId: 2, schedule: "ST", rate: 95 },
    ]);

    await run();

    const rows = prismaMock.versionRoleRate.createMany.mock.calls[0][0].data;
    expect(rows).toContainEqual({ versionId: 5, roleId: 2, schedule: "ST", rate: 95 });
    expect(rows).not.toContainEqual(
      expect.objectContaining({ roleId: 2, schedule: "ST", rate: 91 }),
    );
  });

  it("stamps the marker with the acting user", async () => {
    await run();
    expect(prismaMock.estimateVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ ratesFrozenById: approver.id }),
      }),
    );
  });

  it("refuses to re-freeze an already-frozen version", async () => {
    // Silently re-materializing would reprice the very revision the freeze was
    // meant to protect.
    prismaMock.estimateVersion.findUniqueOrThrow.mockResolvedValue({
      projectId: 42,
      ratesFrozenAt: new Date("2026-01-01"),
    });

    await expect(run()).rejects.toThrow(/already frozen/);
    expect(prismaMock.versionRoleRate.createMany).not.toHaveBeenCalled();
    expect(prismaMock.estimateVersion.update).not.toHaveBeenCalled();
  });

  it("requires APPROVER privilege", async () => {
    requireProjectAccessFn.mockResolvedValue(plainUser);
    await expect(run()).rejects.toThrow(/requires APPROVER/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("authorizes against the version's own project", async () => {
    await run();
    expect(requireProjectAccessFn).toHaveBeenCalledWith(42);
  });

  it("writes an audit event recording the freeze", async () => {
    await run();
    const rows = auditCreateMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      entityType: "EstimateVersion",
      entityId: 5,
      projectId: 42,
      field: "ratesFrozenAt",
      oldValue: null,
    });
    expect(rows[0].note).toMatch(/Froze 3 labor rate/);
  });

  it("skips the insert when there are no rates at all", async () => {
    prismaMock.roleRate.findMany.mockResolvedValue([]);
    const out = await run();
    expect(out.ratesFrozen).toBe(0);
    expect(prismaMock.versionRoleRate.createMany).not.toHaveBeenCalled();
    // Still marked frozen — an empty book is a legitimate thing to freeze.
    expect(prismaMock.estimateVersion.update).toHaveBeenCalled();
  });
});

describe("unfreezeVersionRates", () => {
  const run = () => unfreezeVersionRates({ data: { versionId: 5 } });

  beforeEach(() => {
    prismaMock.estimateVersion.findUniqueOrThrow.mockResolvedValue({
      projectId: 42,
      ratesFrozenAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("drops the materialized rows and clears the marker", async () => {
    await expect(run()).resolves.toEqual({ ok: true });
    expect(prismaMock.versionRoleRate.deleteMany).toHaveBeenCalledWith({
      where: { versionId: 5 },
    });
    expect(prismaMock.estimateVersion.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { ratesFrozenAt: null, ratesFrozenById: null },
    });
  });

  it("is admin-only", async () => {
    requireAdminFn.mockRejectedValue(
      new Error("Forbidden: requires ADMINISTRATOR privilege"),
    );
    await expect(run()).rejects.toThrow(/ADMINISTRATOR/);
    expect(prismaMock.versionRoleRate.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses when the version is not frozen", async () => {
    prismaMock.estimateVersion.findUniqueOrThrow.mockResolvedValue({
      projectId: 42,
      ratesFrozenAt: null,
    });
    await expect(run()).rejects.toThrow(/not frozen/);
    expect(prismaMock.versionRoleRate.deleteMany).not.toHaveBeenCalled();
  });
});

describe("freezeProjectRates", () => {
  const run = () => freezeProjectRates({ data: { projectId: 42 } });

  it("copies the global book down", async () => {
    const out = await run();
    expect(out.ratesFrozen).toBe(3);
    expect(prismaMock.projectRoleRate.createMany.mock.calls[0][0].data).toHaveLength(3);
  });

  it("does not overwrite an existing negotiated override", async () => {
    // The whole point of a project override is that it is not the global rate.
    // Freezing must leave it alone rather than stamping global over it.
    prismaMock.projectRoleRate.findMany.mockResolvedValue([
      { roleId: 2, schedule: "ST", rate: 95 },
    ]);

    await run();

    const created = prismaMock.projectRoleRate.createMany.mock.calls[0][0].data;
    // Only the two pairs it did NOT already carry get inserted.
    expect(created).toHaveLength(2);
    expect(created).not.toContainEqual(
      expect.objectContaining({ roleId: 2, schedule: "ST" }),
    );
  });

  it("refuses to re-freeze an already-frozen project", async () => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValue({
      ratesFrozenAt: new Date("2026-01-01"),
    });
    await expect(run()).rejects.toThrow(/already frozen/);
    expect(prismaMock.projectRoleRate.createMany).not.toHaveBeenCalled();
  });

  it("requires APPROVER privilege", async () => {
    requireProjectAccessFn.mockResolvedValue(plainUser);
    await expect(run()).rejects.toThrow(/requires APPROVER/);
  });

  it("rejects a non-positive projectId at the validator", async () => {
    await expect(freezeProjectRates({ data: { projectId: 0 } })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("unfreezeProjectRates", () => {
  const run = () => unfreezeProjectRates({ data: { projectId: 42 } });

  beforeEach(() => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValue({
      ratesFrozenAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    prismaMock.projectRoleRate.deleteMany.mockResolvedValue({ count: 3 });
  });

  it("drops the materialized rows and clears the marker", async () => {
    await expect(run()).resolves.toEqual({ ok: true });

    // Every row goes, not just the ones freezing copied down. That is lossless
    // only because freezing is the sole writer of this table — if a negotiated
    // per-project override ever gets its own editor, this has to start
    // distinguishing the two or it will delete contract rates.
    expect(prismaMock.projectRoleRate.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 42 },
    });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { ratesFrozenAt: null, ratesFrozenById: null },
    });
  });

  it("audits the release against the project itself", async () => {
    await run();

    const data = auditCreateMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      entityType: "Project",
      entityId: 42,
      projectId: 42,
      field: "ratesFrozenAt",
      oldValue: "2026-01-01T00:00:00.000Z",
      newValue: null,
    });
  });

  it("is admin-only", async () => {
    requireAdminFn.mockRejectedValue(
      new Error("Forbidden: requires ADMINISTRATOR privilege"),
    );
    await expect(run()).rejects.toThrow(/ADMINISTRATOR/);
    expect(prismaMock.projectRoleRate.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses when the project is not frozen", async () => {
    // Otherwise a stray click would delete the whole materialized book of a
    // project that was never frozen in the first place.
    prismaMock.project.findUniqueOrThrow.mockResolvedValue({
      ratesFrozenAt: null,
    });
    await expect(run()).rejects.toThrow(/not frozen/);
    expect(prismaMock.projectRoleRate.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("rejects a non-positive projectId at the validator", async () => {
    await expect(
      unfreezeProjectRates({ data: { projectId: 0 } }),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});

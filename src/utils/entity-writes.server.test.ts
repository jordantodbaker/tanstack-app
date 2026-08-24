import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * `entity-writes.server` pulls in the real Prisma singleton (and, via
 * `../server/db`, the reminder cron) plus the Clerk-backed
 * `resolveCurrentUser`. Replace all of it with in-memory fakes so these run in
 * the plain unit suite — no database, no Clerk env. Mock handles go through
 * `vi.hoisted` because `vi.mock` is hoisted above the imports.
 *
 * The `$transaction` fake records an ordered call log, which is what lets the
 * tests below assert the *ordering* invariant this helper exists to enforce:
 * the projectId lookup and the access check both happen inside the
 * transaction, before the delete.
 */
const {
  calls,
  transaction,
  findUniqueOrThrow,
  del,
  update,
  auditCreate,
  resolveCurrentUserFn,
  assertProjectAccessFn,
  applyWorkflowTransitionFn,
  flushNotificationEmailsFn,
} = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    transaction: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    del: vi.fn(),
    update: vi.fn(),
    auditCreate: vi.fn(),
    resolveCurrentUserFn: vi.fn(),
    assertProjectAccessFn: vi.fn(),
    applyWorkflowTransitionFn: vi.fn(),
    flushNotificationEmailsFn: vi.fn(),
  };
});

vi.mock("../server/db", () => ({
  prisma: { $transaction: transaction },
}));

vi.mock("./users.server", () => ({
  resolveCurrentUser: resolveCurrentUserFn,
  assertProjectAccess: assertProjectAccessFn,
}));

// `applyWorkflowTransition` is exercised on its own elsewhere; stubbing it here
// keeps these tests on what the wrapper itself owns — ordering, the shared
// `include`, resolving `config`, and when emails are flushed.
vi.mock("./workflow.server", () => ({
  applyWorkflowTransition: applyWorkflowTransitionFn,
}));

vi.mock("./notification-email.server", () => ({
  flushNotificationEmails: flushNotificationEmailsFn,
}));

import {
  deleteProjectScopedRecord,
  transitionProjectScopedRecord,
} from "./entity-writes.server";

const actor: CurrentUser = {
  id: 7,
  clerkId: "clerk-7",
  email: "estimator@example.com",
  role: "USER",
};

/** Stands in for the `tx` client handed to the `$transaction` callback. */
const tx = {
  rfi: { findUniqueOrThrow, delete: del, update },
  auditEvent: { create: auditCreate },
};

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();

  resolveCurrentUserFn.mockResolvedValue(actor);
  assertProjectAccessFn.mockImplementation(async () => {
    calls.push("assertProjectAccess");
  });
  findUniqueOrThrow.mockImplementation(async () => {
    calls.push("findUniqueOrThrow");
    return { projectId: 42 };
  });
  del.mockImplementation(async () => {
    calls.push("delete");
  });
  auditCreate.mockImplementation(async () => {
    calls.push("audit");
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction.mockImplementation(async (fn: (t: any) => Promise<unknown>) => {
    calls.push("tx:begin");
    const out = await fn(tx);
    calls.push("tx:commit");
    return out;
  });
});

const runDelete = () =>
  deleteProjectScopedRecord({
    id: 5,
    entityType: "Rfi",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pickDelegate: (t: any) => t.rfi,
  });

describe("deleteProjectScopedRecord", () => {
  it("runs the lookup, access check, delete and audit inside one transaction", async () => {
    await expect(runDelete()).resolves.toEqual({ ok: true });

    // The ordering that closes the reassignment race: nothing touches the row
    // before `tx:begin`, and the access check sits between the lookup and the
    // delete rather than outside the transaction.
    expect(calls).toEqual([
      "tx:begin",
      "findUniqueOrThrow",
      "assertProjectAccess",
      "delete",
      "audit",
      "tx:commit",
    ]);
  });

  it("authorizes against the projectId read inside the transaction", async () => {
    await runDelete();

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { projectId: true },
    });
    expect(assertProjectAccessFn).toHaveBeenCalledWith(actor, 42);
    expect(del).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("writes a DELETE audit event carrying the entityType and actor", async () => {
    await runDelete();

    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        entityType: "Rfi",
        entityId: 5,
        projectId: 42,
        action: "DELETE",
        actorId: actor.id,
        actorEmail: actor.email,
      },
    });
  });

  it("rejects an anonymous caller before opening a transaction", async () => {
    resolveCurrentUserFn.mockResolvedValue(null);

    await expect(runDelete()).rejects.toThrow("Unauthorized: not signed in");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not delete when the access check throws", async () => {
    assertProjectAccessFn.mockRejectedValue(
      new Error("Forbidden: no access to project 42"),
    );

    await expect(runDelete()).rejects.toThrow("Forbidden");
    expect(del).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("propagates a missing-row error without writing an audit event", async () => {
    findUniqueOrThrow.mockRejectedValue(new Error("No Rfi found"));

    await expect(runDelete()).rejects.toThrow("No Rfi found");
    expect(assertProjectAccessFn).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe("transitionProjectScopedRecord", () => {
  const before = {
    id: 5,
    projectId: 42,
    status: "OPEN",
    createdById: 7,
    rfiNumber: "RFI-001",
  };
  const after = { ...before, status: "ANSWERED" };

  const config = {
    entityType: "Rfi",
    transitionMap: {},
    statusLabels: {},
    statusesNeedingReview: new Set<string>(),
    auditFields: ["status"],
    buildTitle: () => "t",
  };

  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();

    resolveCurrentUserFn.mockResolvedValue(actor);
    assertProjectAccessFn.mockImplementation(async () => {
      calls.push("assertProjectAccess");
    });
    findUniqueOrThrow.mockImplementation(async () => {
      calls.push("findUniqueOrThrow");
      return before;
    });
    applyWorkflowTransitionFn.mockImplementation(async () => {
      calls.push("applyWorkflowTransition");
      return after;
    });
    flushNotificationEmailsFn.mockImplementation(async () => {
      calls.push("flushEmails");
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction.mockImplementation(async (fn: (t: any) => Promise<unknown>) => {
      calls.push("tx:begin");
      const out = await fn(tx);
      calls.push("tx:commit");
      return out;
    });
  });

  const run = (overrides = {}) =>
    transitionProjectScopedRecord({
      id: 5,
      action: "answer",
      comment: "done",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pickDelegate: (t: any) => t.rfi,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: config as any,
      toItem: (r) => ({ mapped: r.status }),
      ...overrides,
    });

  it("reads and authorizes inside the transaction, before transitioning", async () => {
    await expect(run()).resolves.toEqual({ mapped: "ANSWERED" });

    // Same invariant as the delete path: the row read and the access check are
    // both inside the transaction. And emails flush only AFTER commit, so a
    // rolled-back transition can never have sent one.
    expect(calls).toEqual([
      "tx:begin",
      "findUniqueOrThrow",
      "assertProjectAccess",
      "applyWorkflowTransition",
      "tx:commit",
      "flushEmails",
    ]);
  });

  it("authorizes against the projectId on the row it just read", async () => {
    await run();
    expect(assertProjectAccessFn).toHaveBeenCalledWith(actor, 42);
  });

  it("passes the action and comment through to the workflow helper", async () => {
    await run();
    expect(applyWorkflowTransitionFn).toHaveBeenCalledWith(
      expect.objectContaining({ before, actor, action: "answer", comment: "done" }),
    );
  });

  it("applies `include` to both the before-read and the update", async () => {
    const include = { linkedFcos: true };
    await run({ include });

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 5 },
      include,
    });
    // updateRow is handed to applyWorkflowTransition; invoke it to confirm the
    // same include rides along on the write.
    const { updateRow } = applyWorkflowTransitionFn.mock.calls[0][0];
    await updateRow({ status: "ANSWERED" });
    expect(update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { status: "ANSWERED" },
      include,
    });
  });

  it("omits `include` entirely when none is given", async () => {
    await run();
    expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("resolves a function `config` against the before-row", async () => {
    // PCO needs this: whether it stamps submittedAt depends on prior state.
    const configFn = vi.fn().mockReturnValue(config);
    await run({ config: configFn });

    expect(configFn).toHaveBeenCalledWith(before);
    expect(applyWorkflowTransitionFn).toHaveBeenCalledWith(
      expect.objectContaining({ config }),
    );
  });

  it("does not transition or flush emails when access is denied", async () => {
    assertProjectAccessFn.mockRejectedValue(new Error("Forbidden"));

    await expect(run()).rejects.toThrow("Forbidden");
    expect(applyWorkflowTransitionFn).not.toHaveBeenCalled();
    expect(flushNotificationEmailsFn).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller before opening a transaction", async () => {
    resolveCurrentUserFn.mockResolvedValue(null);

    await expect(run()).rejects.toThrow("Unauthorized: not signed in");
    expect(transaction).not.toHaveBeenCalled();
  });
});

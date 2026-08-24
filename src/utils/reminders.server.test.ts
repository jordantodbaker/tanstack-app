import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the WRITE shape of `runScheduledReminders` — the part the pure
 * selector tests in `reminders.test.ts` don't reach.
 *
 * The write path batches every reminder's rows into one `createMany` per table
 * per project (rather than one pair per reminder), so what's worth pinning is
 * that batching didn't change the rows: same content, same order, still one
 * transaction per project, and emails still flushed after each commit.
 *
 * Everything below the six parallel reads is mocked — no database, no Clerk.
 */
const {
  prismaMock,
  transaction,
  notificationCreateMany,
  reminderLogCreateMany,
  flushNotificationEmailsFn,
  selectRemindersFn,
  calls,
} = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    transaction: vi.fn(),
    notificationCreateMany: vi.fn(),
    reminderLogCreateMany: vi.fn(),
    flushNotificationEmailsFn: vi.fn(),
    selectRemindersFn: vi.fn(),
    prismaMock: {
      project: { findMany: vi.fn() },
      changeLog: { findMany: vi.fn() },
      fieldChangeOrder: { findMany: vi.fn() },
      rfi: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
      reminderLog: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../server/db", () => ({ prisma: prismaMock }));

vi.mock("./notification-email.server", () => ({
  flushNotificationEmails: flushNotificationEmailsFn,
}));

// Stub the pure selector so these tests control exactly which reminders fire.
vi.mock("./reminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reminders")>();
  return { ...actual, selectReminders: selectRemindersFn };
});

import { runScheduledReminders } from "./reminders.server";

const NOW = new Date("2026-06-15T12:00:00.000Z");

/** One remindable CVR, enough to get past the empty-project short-circuit. */
const cvrRow = {
  id: 11,
  projectId: 1,
  status: "IN_REVIEW",
  updatedAt: NOW,
  createdById: 5,
  cvrNumber: "CVR-001",
  title: "Test CVR",
};

function reminder(overrides = {}) {
  return {
    reminderType: "CVR_STALE",
    entityType: "ChangeLog",
    entityId: 11,
    projectId: 1,
    recipientUserIds: [101, 102],
    title: "CVR-001 — Test CVR",
    message: "Awaiting review",
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();

  prismaMock.project.findMany.mockResolvedValue([{ id: 1 }]);
  prismaMock.changeLog.findMany.mockResolvedValue([cvrRow]);
  prismaMock.fieldChangeOrder.findMany.mockResolvedValue([]);
  prismaMock.rfi.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.reminderLog.findMany.mockResolvedValue([]);

  notificationCreateMany.mockImplementation(async () => {
    calls.push("notification.createMany");
  });
  reminderLogCreateMany.mockImplementation(async () => {
    calls.push("reminderLog.createMany");
  });
  flushNotificationEmailsFn.mockImplementation(async () => {
    calls.push("flushEmails");
  });
  transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fn: (t: any) => Promise<unknown>) => {
      calls.push("tx:begin");
      const out = await fn({
        notification: { createMany: notificationCreateMany },
        reminderLog: { createMany: reminderLogCreateMany },
      });
      calls.push("tx:commit");
      return out;
    },
  );
  prismaMock.$transaction = transaction;
});

describe("runScheduledReminders write path", () => {
  it("issues ONE createMany per table per project, not per reminder", async () => {
    selectRemindersFn.mockReturnValue([
      reminder({ entityId: 11 }),
      reminder({ entityId: 12 }),
      reminder({ entityId: 13 }),
    ]);

    await runScheduledReminders(NOW);

    // Three reminders — previously six round-trips, now two.
    expect(notificationCreateMany).toHaveBeenCalledTimes(1);
    expect(reminderLogCreateMany).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "tx:begin",
      "notification.createMany",
      "reminderLog.createMany",
      "tx:commit",
      "flushEmails",
    ]);
  });

  it("writes one row per (reminder × recipient), in order", async () => {
    selectRemindersFn.mockReturnValue([
      reminder({ entityId: 11, recipientUserIds: [101, 102] }),
      reminder({ entityId: 12, recipientUserIds: [103] }),
    ]);

    await runScheduledReminders(NOW);

    const rows = notificationCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows.map((r: { userId: number; entityId: number }) => [
      r.entityId,
      r.userId,
    ])).toEqual([
      [11, 101],
      [11, 102],
      [12, 103],
    ]);
  });

  it("carries the full notification payload onto every row", async () => {
    selectRemindersFn.mockReturnValue([
      reminder({ recipientUserIds: [101] }),
    ]);

    await runScheduledReminders(NOW);

    expect(notificationCreateMany.mock.calls[0][0].data[0]).toEqual({
      userId: 101,
      projectId: 1,
      entityType: "ChangeLog",
      entityId: 11,
      title: "CVR-001 — Test CVR",
      message: "Awaiting review",
      actorEmail: "system",
    });
  });

  it("stamps every reminder-log row with the run's `now`", async () => {
    selectRemindersFn.mockReturnValue([
      reminder({ recipientUserIds: [101, 102] }),
    ]);

    await runScheduledReminders(NOW);

    const rows = reminderLogCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.sentAt).toBe(NOW);
      expect(r.reminderType).toBe("CVR_STALE");
      expect(r.projectId).toBe(1);
    }
  });

  it("counts reminders and notifications for the run result", async () => {
    selectRemindersFn.mockReturnValue([
      reminder({ entityId: 11, recipientUserIds: [101, 102] }),
      reminder({ entityId: 12, recipientUserIds: [103] }),
    ]);

    await expect(runScheduledReminders(NOW)).resolves.toEqual({
      projectsScanned: 1,
      remindersFired: 2,
      notificationsCreated: 3,
    });
  });

  it("opens no transaction when a project has no reminders to fire", async () => {
    selectRemindersFn.mockReturnValue([]);

    await runScheduledReminders(NOW);

    expect(transaction).not.toHaveBeenCalled();
    expect(flushNotificationEmailsFn).not.toHaveBeenCalled();
  });

  it("uses a separate transaction per project", async () => {
    prismaMock.project.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prismaMock.changeLog.findMany.mockResolvedValue([
      cvrRow,
      { ...cvrRow, id: 21, projectId: 2 },
    ]);
    selectRemindersFn.mockImplementation(
      (input: { projectId: number }) => [
        reminder({ projectId: input.projectId }),
      ],
    );

    await runScheduledReminders(NOW);

    // One project failing must not take the other's writes with it, so the
    // transactions stay separate rather than wrapping the whole run.
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(flushNotificationEmailsFn).toHaveBeenCalledTimes(2);
  });
});

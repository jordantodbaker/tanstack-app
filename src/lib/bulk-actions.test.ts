import { describe, expect, it } from "vitest";
import { bulkActionsForSelection, runBulk, type BulkRow } from "./bulk-actions";
import { CVR_TRANSITIONS } from "~/utils/workflow";

const approver = { id: 1, role: "APPROVER" as const };
const user = { id: 2, role: "USER" as const };
const admin = { id: 3, role: "ADMINISTRATOR" as const };

function row(id: number, status: string, createdById: number | null = null): BulkRow {
  return { id, status, createdById };
}

describe("bulkActionsForSelection", () => {
  it("offers an action only for the rows it's legal on", () => {
    const rows = [
      row(10, "PENDING_APPROVAL"),
      row(11, "PENDING_APPROVAL"),
      row(12, "APPROVED"),
    ];
    const actions = bulkActionsForSelection(CVR_TRANSITIONS, rows, approver);

    const approve = actions.find((a) => a.action === "Approve");
    expect(approve).toBeDefined();
    // Approve is only legal from PENDING_APPROVAL → ids 10 + 11, not 12.
    expect(approve!.ids.sort()).toEqual([10, 11]);
    expect(approve!.destructive).toBe(false);

    // "Mark executed" only applies to the APPROVED row.
    const exec = actions.find((a) => a.action === "Mark executed");
    expect(exec!.ids).toEqual([12]);
  });

  it("flags VOID / REJECTED transitions as destructive", () => {
    // Admin actor so both Reject (APPROVER+) and Void (ADMINISTRATOR) appear.
    const actions = bulkActionsForSelection(
      CVR_TRANSITIONS,
      [row(1, "PENDING_APPROVAL")],
      admin,
    );
    expect(actions.find((a) => a.action === "Void")!.destructive).toBe(true);
    expect(actions.find((a) => a.action === "Reject")!.destructive).toBe(true);
  });

  it("respects the originator block — the raiser can't approve their own", () => {
    // Row created by the approver themselves.
    const own = bulkActionsForSelection(
      CVR_TRANSITIONS,
      [row(1, "PENDING_APPROVAL", approver.id)],
      approver,
    );
    expect(own.find((a) => a.action === "Approve")).toBeUndefined();
    // Someone else's row is approvable.
    const other = bulkActionsForSelection(
      CVR_TRANSITIONS,
      [row(1, "PENDING_APPROVAL", 999)],
      approver,
    );
    expect(other.find((a) => a.action === "Approve")).toBeDefined();
  });

  it("filters by role — a USER sees no approver-only actions", () => {
    const actions = bulkActionsForSelection(
      CVR_TRANSITIONS,
      [row(1, "PENDING_APPROVAL", 999)],
      user,
    );
    expect(actions.find((a) => a.action === "Approve")).toBeUndefined();
    // Void is ADMINISTRATOR-only, so a USER doesn't get it either.
    expect(actions.find((a) => a.action === "Void")).toBeUndefined();
  });

  it("offers Void to an administrator across mixed statuses", () => {
    const actions = bulkActionsForSelection(
      CVR_TRANSITIONS,
      [row(1, "REQUESTED"), row(2, "APPROVED"), row(3, "PENDING_APPROVAL")],
      admin,
    );
    const voidAction = actions.find((a) => a.action === "Void");
    expect(voidAction!.ids.sort()).toEqual([1, 2, 3]);
  });

  it("returns nothing for terminal-status selections", () => {
    expect(
      bulkActionsForSelection(CVR_TRANSITIONS, [row(1, "EXECUTED")], admin),
    ).toEqual([]);
  });
});

describe("runBulk", () => {
  it("counts successes and tolerates per-item failures", async () => {
    const r = await runBulk([1, 2, 3, 4], async (id) => {
      if (id === 3) throw new Error("nope");
    });
    expect(r.ok).toBe(3);
    expect(r.failed).toBe(1);
    expect(r.firstError).toBe("nope");
  });

  it("runs every id and reports clean when all succeed", async () => {
    const seen: number[] = [];
    const r = await runBulk([5, 6, 7], async (id) => {
      seen.push(id);
    });
    expect(seen.sort()).toEqual([5, 6, 7]);
    expect(r).toEqual({ ok: 3, failed: 0, firstError: null });
  });

  it("handles an empty selection", async () => {
    expect(await runBulk([], async () => {})).toEqual({
      ok: 0,
      failed: 0,
      firstError: null,
    });
  });
});

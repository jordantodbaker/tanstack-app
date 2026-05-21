import { describe, expect, it } from "vitest";
import {
  CVR_TRANSITIONS,
  FCO_TRANSITIONS,
  availableTransitions,
} from "./workflow";

const actions = (ts: { action: string }[]) =>
  ts.map((t) => t.action).sort();

describe("availableTransitions", () => {
  it("gives a plain USER no approval transitions from PENDING_APPROVAL", () => {
    // Every exit from PENDING_APPROVAL needs APPROVER or ADMINISTRATOR.
    expect(
      availableTransitions(CVR_TRANSITIONS, "PENDING_APPROVAL", "USER", false),
    ).toEqual([]);
  });

  it("lets an APPROVER approve, reject, or send back a pending CVR", () => {
    expect(
      actions(
        availableTransitions(
          CVR_TRANSITIONS,
          "PENDING_APPROVAL",
          "APPROVER",
          false,
        ),
      ),
    ).toEqual(["Approve", "Reject", "Send back"]);
  });

  it("blocks an APPROVER from approving/rejecting their own CVR", () => {
    // blockOriginator strips Approve & Reject; Send back carries no block.
    expect(
      actions(
        availableTransitions(
          CVR_TRANSITIONS,
          "PENDING_APPROVAL",
          "APPROVER",
          true,
        ),
      ),
    ).toEqual(["Send back"]);
  });

  it("applies the originator block regardless of role", () => {
    // Even an ADMINISTRATOR cannot self-approve a CVR they raised.
    expect(
      actions(
        availableTransitions(
          CVR_TRANSITIONS,
          "PENDING_APPROVAL",
          "ADMINISTRATOR",
          true,
        ),
      ),
    ).toEqual(["Send back", "Void"]);
  });

  it("gives an ADMINISTRATOR every transition incl. Void when not originator", () => {
    expect(
      actions(
        availableTransitions(
          CVR_TRANSITIONS,
          "PENDING_APPROVAL",
          "ADMINISTRATOR",
          false,
        ),
      ),
    ).toEqual(["Approve", "Reject", "Send back", "Void"]);
  });

  it("returns nothing for terminal states", () => {
    for (const role of ["USER", "APPROVER", "ADMINISTRATOR"] as const) {
      expect(
        availableTransitions(CVR_TRANSITIONS, "EXECUTED", role, false),
      ).toEqual([]);
      expect(
        availableTransitions(CVR_TRANSITIONS, "VOID", role, false),
      ).toEqual([]);
      expect(
        availableTransitions(FCO_TRANSITIONS, "CLOSED", role, false),
      ).toEqual([]);
    }
  });

  it("gates FCO review behind APPROVER", () => {
    expect(
      availableTransitions(FCO_TRANSITIONS, "SUBMITTED", "USER", false),
    ).toEqual([]);
    expect(
      actions(
        availableTransitions(
          FCO_TRANSITIONS,
          "SUBMITTED",
          "APPROVER",
          false,
        ),
      ),
    ).toEqual(["Begin review"]);
  });
});

describe("transition maps", () => {
  it("CVR transitions only target known statuses", () => {
    const keys = new Set(Object.keys(CVR_TRANSITIONS));
    for (const list of Object.values(CVR_TRANSITIONS)) {
      for (const t of list) expect(keys.has(t.to)).toBe(true);
    }
  });

  it("FCO transitions only target known statuses", () => {
    const keys = new Set(Object.keys(FCO_TRANSITIONS));
    for (const list of Object.values(FCO_TRANSITIONS)) {
      for (const t of list) expect(keys.has(t.to)).toBe(true);
    }
  });

  it("has no self-loop transitions", () => {
    for (const [status, list] of Object.entries(CVR_TRANSITIONS)) {
      for (const t of list) expect(t.to).not.toBe(status);
    }
    for (const [status, list] of Object.entries(FCO_TRANSITIONS)) {
      for (const t of list) expect(t.to).not.toBe(status);
    }
  });
});

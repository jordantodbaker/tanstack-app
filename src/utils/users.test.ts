import { describe, expect, it } from "vitest";
import {
  ROLE_LABELS,
  ROLE_RANK,
  assertProjectUnchanged,
  hasAtLeastRole,
  type UserRole,
} from "./users";

// Independent enumeration of every UserRole. If a role is added to the
// `UserRole` union, this list must be updated too — the "key set" assertions
// below then fail unless ROLE_RANK and ROLE_LABELS were updated to match.
const ALL_ROLES: UserRole[] = ["USER", "APPROVER", "ADMINISTRATOR"];

describe("ROLE_RANK", () => {
  it("has an entry for every role", () => {
    expect(Object.keys(ROLE_RANK).sort()).toEqual([...ALL_ROLES].sort());
  });

  it("ranks ADMINISTRATOR strictly above USER", () => {
    expect(ROLE_RANK.ADMINISTRATOR).toBeGreaterThan(ROLE_RANK.USER);
  });

  it("places APPROVER between USER and ADMINISTRATOR", () => {
    expect(ROLE_RANK.APPROVER).toBeGreaterThan(ROLE_RANK.USER);
    expect(ROLE_RANK.APPROVER).toBeLessThan(ROLE_RANK.ADMINISTRATOR);
  });

  it("assigns a distinct rank to every role", () => {
    const ranks = ALL_ROLES.map((r) => ROLE_RANK[r]);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe("hasAtLeastRole", () => {
  it("is reflexive — every role satisfies its own minimum", () => {
    for (const role of ALL_ROLES) {
      expect(hasAtLeastRole(role, role)).toBe(true);
    }
  });

  it("grants a higher role access to a lower minimum", () => {
    expect(hasAtLeastRole("ADMINISTRATOR", "USER")).toBe(true);
  });

  it("denies a lower role access to a higher minimum", () => {
    // The security-critical case: a plain USER must not clear an
    // ADMINISTRATOR gate.
    expect(hasAtLeastRole("USER", "ADMINISTRATOR")).toBe(false);
  });

  it("agrees with ROLE_RANK ordering for every role pair", () => {
    for (const role of ALL_ROLES) {
      for (const minimum of ALL_ROLES) {
        expect(hasAtLeastRole(role, minimum)).toBe(
          ROLE_RANK[role] >= ROLE_RANK[minimum],
        );
      }
    }
  });
});

describe("ROLE_LABELS", () => {
  it("has a non-empty label for every role", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ALL_ROLES].sort());
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});

describe("assertProjectUnchanged", () => {
  it("allows an in-place edit (same project)", () => {
    expect(() => assertProjectUnchanged("RFI", 42, 42)).not.toThrow();
  });

  it("rejects a cross-project move", () => {
    // The security-critical case: the update targets a record in project 7
    // but the request claims project 42. This must be refused so a user with
    // access only to 42 cannot edit/reassign a record that lives in 7.
    expect(() => assertProjectUnchanged("RFI", 42, 7)).toThrow(
      /different project/,
    );
  });

  it("names the entity in the error message", () => {
    expect(() => assertProjectUnchanged("PCO", 1, 2)).toThrow(
      "Cannot move this PCO to a different project.",
    );
  });
});

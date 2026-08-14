import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

// `users.server` pulls in the real Prisma singleton (and, via `../server/db`,
// the reminder cron) plus Clerk's server SDK. Replace both with in-memory fakes
// so these tests run in the plain unit suite — no database, no Clerk env. The
// mock handles must be created through `vi.hoisted` because `vi.mock` is hoisted
// above the imports.
const { userFindFirst, userFindUnique, authFn } = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  authFn: vi.fn(),
}));

vi.mock("../server/db", () => ({
  prisma: { user: { findFirst: userFindFirst, findUnique: userFindUnique } },
}));

vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: authFn,
  clerkClient: vi.fn(),
}));

import { assertProjectAccess, requireProjectAccess } from "./users.server";

const admin: CurrentUser = {
  id: 1,
  clerkId: "clerk-admin",
  email: "admin@example.com",
  role: "ADMINISTRATOR",
};
const user: CurrentUser = {
  id: 2,
  clerkId: "clerk-user",
  email: "user@example.com",
  role: "USER",
};

describe("assertProjectAccess", () => {
  beforeEach(() => userFindFirst.mockReset());

  it("lets an administrator through without querying membership", async () => {
    await expect(assertProjectAccess(admin, 99)).resolves.toBeUndefined();
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("allows a non-admin who is assigned to the project", async () => {
    userFindFirst.mockResolvedValue({ id: user.id });
    await expect(assertProjectAccess(user, 5)).resolves.toBeUndefined();
    // Membership is checked for THIS user AND THIS project specifically.
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: user.id, projects: { some: { id: 5 } } },
      select: { id: true },
    });
  });

  it("rejects a non-admin not assigned to the project", async () => {
    // The security-critical case behind the upsert fix: passing a record's
    // *existing* projectId here must throw when the actor can't reach it, so a
    // user scoped to project A can't edit a record that lives in project B.
    userFindFirst.mockResolvedValue(null);
    await expect(assertProjectAccess(user, 7)).rejects.toThrow(
      "Forbidden: no access to project 7",
    );
  });
});

describe("requireProjectAccess", () => {
  beforeEach(() => {
    authFn.mockReset();
    userFindUnique.mockReset();
    userFindFirst.mockReset();
  });

  it("throws when nobody is signed in", async () => {
    authFn.mockResolvedValue({ userId: null });
    await expect(requireProjectAccess(3)).rejects.toThrow(
      "Unauthorized: not signed in",
    );
  });

  it("resolves the actor and enforces access for a signed-in user", async () => {
    authFn.mockResolvedValue({ userId: user.clerkId });
    userFindUnique.mockResolvedValue(user); // resolveCurrentUser lookup
    userFindFirst.mockResolvedValue(null); // not assigned to project 8
    await expect(requireProjectAccess(8)).rejects.toThrow(
      "Forbidden: no access to project 8",
    );
  });
});

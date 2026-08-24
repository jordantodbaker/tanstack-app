import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

// `users.server` pulls in the real Prisma singleton (and, via `../server/db`,
// the reminder cron) plus Clerk's server SDK. Replace both with in-memory fakes
// so these tests run in the plain unit suite — no database, no Clerk env. The
// mock handles must be created through `vi.hoisted` because `vi.mock` is hoisted
// above the imports.
const { userFindFirst, userFindUnique, estimateVersionFindUnique, authFn } =
  vi.hoisted(() => ({
    userFindFirst: vi.fn(),
    userFindUnique: vi.fn(),
    estimateVersionFindUnique: vi.fn(),
    authFn: vi.fn(),
  }));

vi.mock("../server/db", () => ({
  prisma: {
    user: { findFirst: userFindFirst, findUnique: userFindUnique },
    estimateVersion: { findUnique: estimateVersionFindUnique },
  },
}));

vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: authFn,
  clerkClient: vi.fn(),
}));

import {
  assertProjectAccess,
  projectIdScopedHandler,
  projectScopedHandler,
  requireProjectAccess,
  requireVersionAccess,
} from "./users.server";

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

describe("requireVersionAccess", () => {
  beforeEach(() => {
    authFn.mockReset();
    userFindUnique.mockReset();
    userFindFirst.mockReset();
    estimateVersionFindUnique.mockReset();
  });

  it("throws when nobody is signed in", async () => {
    authFn.mockResolvedValue({ userId: null });
    await expect(requireVersionAccess(5)).rejects.toThrow(
      "Unauthorized: not signed in",
    );
    // Never even looks the version up if the caller isn't authenticated.
    expect(estimateVersionFindUnique).not.toHaveBeenCalled();
  });

  it("throws when the version does not exist", async () => {
    authFn.mockResolvedValue({ userId: user.clerkId });
    userFindUnique.mockResolvedValue(user);
    estimateVersionFindUnique.mockResolvedValue(null);
    await expect(requireVersionAccess(5)).rejects.toThrow(
      "Estimate version 5 not found",
    );
  });

  it("resolves the version's project and returns actor + projectId for an admin", async () => {
    authFn.mockResolvedValue({ userId: admin.clerkId });
    userFindUnique.mockResolvedValue(admin);
    estimateVersionFindUnique.mockResolvedValue({ projectId: 12 });

    await expect(requireVersionAccess(5)).resolves.toEqual({
      actor: admin,
      projectId: 12,
    });
    // The guard looks the version up by id and reads only its owning project.
    expect(estimateVersionFindUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { projectId: true },
    });
    // Admin bypass: no per-project membership query.
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("enforces project access — a non-admin without the version's project is rejected", async () => {
    authFn.mockResolvedValue({ userId: user.clerkId });
    userFindUnique.mockResolvedValue(user);
    estimateVersionFindUnique.mockResolvedValue({ projectId: 9 });
    userFindFirst.mockResolvedValue(null); // not assigned to project 9

    await expect(requireVersionAccess(5)).rejects.toThrow(
      "Forbidden: no access to project 9",
    );
  });
});

/**
 * The two wrappers exist so a project-scoped endpoint can't be written without
 * its access check — the gate is structural rather than a line each handler
 * has to remember. These tests pin the two properties that matter: the check
 * runs BEFORE the body, and a rejected check means the body never runs at all.
 */
describe("projectScopedHandler / projectIdScopedHandler", () => {
  beforeEach(() => {
    authFn.mockReset();
    userFindUnique.mockReset();
    userFindFirst.mockReset();
  });

  /** Signs in `who` and decides whether they're a member of the project. */
  function signIn(who: CurrentUser, isMember: boolean) {
    authFn.mockResolvedValue({ userId: who.clerkId });
    userFindUnique.mockResolvedValue(who);
    userFindFirst.mockResolvedValue(isMember ? { id: who.id } : null);
  }

  it("runs the body only after the access check passes", async () => {
    signIn(user, true);
    const order: string[] = [];
    userFindFirst.mockImplementation(async () => {
      order.push("check");
      return { id: user.id };
    });
    const handler = projectScopedHandler(async ({ data }) => {
      order.push("body");
      return data.projectId * 2;
    });

    await expect(handler({ data: { projectId: 21 } })).resolves.toBe(42);
    expect(order).toEqual(["check", "body"]);
  });

  it("never invokes the body when the caller lacks project access", async () => {
    signIn(user, false);
    const body = vi.fn();
    const handler = projectScopedHandler(body);

    await expect(handler({ data: { projectId: 7 } })).rejects.toThrow(
      "Forbidden: no access to project 7",
    );
    expect(body).not.toHaveBeenCalled();
  });

  it("never invokes the body when nobody is signed in", async () => {
    authFn.mockResolvedValue({ userId: null });
    const body = vi.fn();

    await expect(
      projectScopedHandler(body)({ data: { projectId: 7 } }),
    ).rejects.toThrow("Unauthorized: not signed in");
    expect(body).not.toHaveBeenCalled();
  });

  it("gates on the projectId carried in `data` — not one the body picks", async () => {
    signIn(user, true);
    await projectScopedHandler(async () => null)({ data: { projectId: 33 } });

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: user.id, projects: { some: { id: 33 } } },
      select: { id: true },
    });
  });

  it("projectIdScopedHandler gates on the scalar `data` itself", async () => {
    signIn(user, true);
    const body = vi.fn().mockResolvedValue("ok");

    await expect(projectIdScopedHandler(body)({ data: 12 })).resolves.toBe("ok");
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: user.id, projects: { some: { id: 12 } } },
      select: { id: true },
    });
    // The body still receives the original args shape untouched.
    expect(body).toHaveBeenCalledWith({ data: 12 });
  });

  it("projectIdScopedHandler blocks the body on a failed check", async () => {
    signIn(user, false);
    const body = vi.fn();

    await expect(projectIdScopedHandler(body)({ data: 4 })).rejects.toThrow(
      "Forbidden: no access to project 4",
    );
    expect(body).not.toHaveBeenCalled();
  });

  it("lets an administrator through without a membership query", async () => {
    authFn.mockResolvedValue({ userId: admin.clerkId });
    userFindUnique.mockResolvedValue(admin);

    await expect(
      projectIdScopedHandler(async () => "ok")({ data: 999 }),
    ).resolves.toBe("ok");
    expect(userFindFirst).not.toHaveBeenCalled();
  });
});

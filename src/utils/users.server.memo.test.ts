import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./users";

/**
 * The per-request memo on the auth guards. `users.server.test.ts` runs with
 * no request context, where the memo is inert; this file supplies one, so it
 * can pin that a request resolves its user once and checks a membership
 * once, and that the next request starts over.
 */
const { userFindUnique, userFindFirst, authFn, requestRef } = vi.hoisted(
  () => ({
    userFindUnique: vi.fn(),
    userFindFirst: vi.fn(),
    authFn: vi.fn(),
    requestRef: { current: null as Request | null },
  }),
);

vi.mock("../server/db", () => ({
  prisma: {
    user: { findUnique: userFindUnique, findFirst: userFindFirst },
  },
}));
vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: authFn,
  clerkClient: () => ({ users: { getUser: vi.fn() } }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    if (!requestRef.current) throw new Error("no request context");
    return requestRef.current;
  },
}));

import { assertProjectAccess, resolveCurrentUser } from "./users.server";

const user: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "u@x.com",
  role: "USER",
};

beforeEach(() => {
  userFindUnique.mockReset();
  userFindFirst.mockReset();
  authFn.mockReset();
  authFn.mockResolvedValue({ userId: user.clerkId });
  userFindUnique.mockResolvedValue(user);
  userFindFirst.mockResolvedValue({ id: user.id });
  requestRef.current = new Request("https://example.test/");
});

describe("per-request memo", () => {
  it("resolves the user once per request, even for concurrent callers", async () => {
    const [a, b, c] = await Promise.all([
      resolveCurrentUser(),
      resolveCurrentUser(),
      resolveCurrentUser(),
    ]);
    expect(a).toEqual(user);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(userFindUnique).toHaveBeenCalledTimes(1);
  });

  it("checks a project membership once per request, per project", async () => {
    await Promise.all([
      assertProjectAccess(user, 3),
      assertProjectAccess(user, 3),
      assertProjectAccess(user, 4),
    ]);
    expect(userFindFirst).toHaveBeenCalledTimes(2);
  });

  it("starts over on the next request", async () => {
    await resolveCurrentUser();
    await assertProjectAccess(user, 3);
    requestRef.current = new Request("https://example.test/next");
    await resolveCurrentUser();
    await assertProjectAccess(user, 3);
    expect(userFindUnique).toHaveBeenCalledTimes(2);
    expect(userFindFirst).toHaveBeenCalledTimes(2);
  });

  it("runs the lookup every time when there is no request to key on", async () => {
    requestRef.current = null;
    await resolveCurrentUser();
    await resolveCurrentUser();
    expect(userFindUnique).toHaveBeenCalledTimes(2);
  });

  it("a refused membership stays refused within the request", async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(assertProjectAccess(user, 9)).rejects.toThrow(
      "Forbidden: no access to project 9",
    );
    await expect(assertProjectAccess(user, 9)).rejects.toThrow("Forbidden");
    expect(userFindFirst).toHaveBeenCalledTimes(1);
  });
});

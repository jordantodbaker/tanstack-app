import { beforeEach, describe, expect, it, vi } from "vitest";

const { findRfi } = vi.hoisted(() => ({ findRfi: vi.fn() }));
vi.mock("../server/db", () => ({
  prisma: { rfi: { findUnique: findRfi } },
}));

import {
  assertParentInProject,
  assertSameProject,
} from "./entityLookup.server";

describe("assertSameProject", () => {
  it("passes a row in the claimed project", () => {
    expect(() => assertSameProject({ projectId: 7 }, 7, "Version")).not.toThrow();
  });

  it("rejects a row from another project, and a missing one", () => {
    expect(() => assertSameProject({ projectId: 8 }, 7, "Linked RFI")).toThrow(
      "Linked RFI does not belong to this project.",
    );
    expect(() => assertSameProject(null, 7, "Linked RFI")).toThrow(
      "Linked RFI does not belong to this project.",
    );
  });
});

describe("assertParentInProject", () => {
  beforeEach(() => {
    findRfi.mockReset();
  });

  it("returns the parent when it is in the claimed project", async () => {
    findRfi.mockResolvedValue({
      projectId: 7,
      createdById: 3,
      rfiNumber: "RFI-0001",
      subject: "Pipe rack clash",
    });
    const parent = await assertParentInProject("Rfi", 12, 7);
    expect(parent.projectId).toBe(7);
    expect(parent.originatorId).toBe(3);
  });

  it("rejects a parent that belongs to another project", async () => {
    findRfi.mockResolvedValue({
      projectId: 8,
      createdById: 3,
      rfiNumber: "RFI-0001",
      subject: "Pipe rack clash",
    });
    await expect(assertParentInProject("Rfi", 12, 7)).rejects.toThrow(
      "Rfi #12 does not belong to this project.",
    );
  });

  it("still denies an entity type it does not know", async () => {
    await expect(assertParentInProject("Invoice", 12, 7)).rejects.toThrow();
    expect(findRfi).not.toHaveBeenCalled();
  });
});

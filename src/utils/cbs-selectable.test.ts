import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every lookup that offers a code to pick leaves inactive ones out — the rule
 * Setup and the Project Cost Code List already apply.
 */
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../server/db", () => ({
  prisma: { cbsItem: { findMany } },
}));
vi.mock("./users.server", () => ({
  adminHandler: (h: unknown) => h,
  adminHandlerNoInput: (h: unknown) => h,
  projectIdScopedHandler: (h: unknown) => h,
  signedInHandler: (h: unknown) => h,
  requireProjectAccess: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      inputValidator: () => builder,
      handler: (h: (args: unknown) => unknown) => h,
    };
    return builder;
  },
}));

import {
  fetchCbsItemsByL1EndsWith,
  fetchCbsItemsByL1Filtered,
  resolveCbsCodes,
  searchCbsCodeOptions,
} from "./cbs";
import { cbsSelectableWhere } from "./cbs-rows.server";

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
});

const where = () => JSON.stringify(findMany.mock.calls.at(-1)![0].where);
const rule = JSON.stringify(cbsSelectableWhere.OR);

describe("code lookups offer selectable codes only", () => {
  it.each([null, 1])("take-off options (project %s)", async (projectId) => {
    await fetchCbsItemsByL1Filtered({ data: { l1Values: ["601"], projectId } });
    expect(where()).toContain(rule);
  });

  it("materials options", async () => {
    await fetchCbsItemsByL1EndsWith({ data: ["11"] });
    expect(where()).toContain(rule);
  });

  it.each(["", "pipe"])("code search (%j)", async (query) => {
    await searchCbsCodeOptions({ data: { query } });
    expect(where()).toContain(rule);
  });

  it("pasted codes", async () => {
    await resolveCbsCodes({
      data: ["601-c0-0000-00-m", "601C0000000M", " 602 00 0000 00 L ", "-"],
    });
    expect(where()).toContain(rule);
    expect(where()).toContain('["601C0000000M","60200000000L"]');
  });
});

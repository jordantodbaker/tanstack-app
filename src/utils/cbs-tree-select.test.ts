import { describe, expectTypeOf, it } from "vitest";
import type { Prisma } from "~/generated/prisma/client";
import type { cbsTreeRowSelect } from "~/utils/cbs";
import type { CbsTreeItem } from "~/lib/cbs-tree";

/**
 * Compile-time guard: a row produced by the shared tree select must satisfy
 * the tree's item type. Dropping a column from `cbsTreeRowSelect` fails
 * `tsc --noEmit` here rather than at the first page that builds a tree.
 */
type TreeSelectRow = Prisma.CbsItemGetPayload<{ select: typeof cbsTreeRowSelect }>;

describe("cbsTreeRowSelect", () => {
  it("selects every field CbsTreeItem needs", () => {
    expectTypeOf<TreeSelectRow>().toMatchTypeOf<CbsTreeItem>();
  });
});

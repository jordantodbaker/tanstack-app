import { describe, expectTypeOf, it } from "vitest";
import type { Prisma } from "~/generated/prisma/client";
import type { cbsTreeRowSelect, CbsTreeRow, CbsWireRow } from "~/utils/cbs";
import type { CbsTreeItem } from "~/lib/cbs-tree";

/**
 * Compile-time guards on the CBS read shape. These fail `tsc --noEmit` here
 * rather than at the first page that builds a tree.
 *
 * The wire row deliberately omits l1-l6 — they are slices of the display code,
 * and sending both was ~420 KB of the catalog's 1.9 MB. `withCbsLevels` puts
 * them back, so `CbsTreeRow` is what components actually see and `CbsTreeItem`
 * is what they must satisfy.
 */
type TreeSelectRow = Prisma.CbsItemGetPayload<{
  select: typeof cbsTreeRowSelect;
}>;

describe("cbsTreeRowSelect", () => {
  it("selects every field CbsTreeItem needs, once the levels are derived", () => {
    expectTypeOf<CbsTreeRow>().toMatchTypeOf<CbsTreeItem>();
  });

  it("still selects the display code the levels are derived from", () => {
    // Dropping this column would silently leave every level an empty string.
    expectTypeOf<TreeSelectRow>().toMatchTypeOf<{ displayCode: string }>();
    expectTypeOf<CbsWireRow>().toEqualTypeOf<TreeSelectRow>();
  });

  it("does not ship the level segments", () => {
    // The point of the select. If a level is ever added back here, the derive
    // step becomes dead weight on every row of the catalog.
    expectTypeOf<TreeSelectRow>().not.toHaveProperty("l1");
    expectTypeOf<TreeSelectRow>().not.toHaveProperty("l6");
  });
});

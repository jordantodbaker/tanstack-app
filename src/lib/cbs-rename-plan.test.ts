import { describe, expect, it } from "vitest";
import {
  cbsDisplayDescription,
  planCbsRenames,
  type CbsRename,
  type CbsRenameRow,
} from "./cbs-rename-plan";

const rename = (over: Partial<CbsRename> = {}): CbsRename => ({
  displayCode: "300-00-0000-00-0",
  from: "Structural Steel Shop Fabrication",
  to: "Structural Steel",
  workbookCell: "H2001",
  ...over,
});

const row = (over: Partial<CbsRenameRow> = {}): CbsRenameRow => ({
  id: 7,
  displayCode: "300-00-0000-00-0",
  name: "Structural Steel Shop Fabrication",
  ...over,
});

describe("planCbsRenames", () => {
  it("renames a row whose stored name is the expected old one", () => {
    expect(planCbsRenames([rename()], [row()])).toEqual([
      {
        kind: "rename",
        displayCode: "300-00-0000-00-0",
        id: 7,
        from: "Structural Steel Shop Fabrication",
        to: "Structural Steel",
      },
    ]);
  });

  it("reports a row already carrying the new name, so re-running is a no-op", () => {
    // The script runs again after every CBS import; the common case is that
    // the workbook was fixed and there is nothing left to do.
    expect(
      planCbsRenames([rename()], [row({ name: "Structural Steel" })]),
    ).toEqual([
      {
        kind: "current",
        displayCode: "300-00-0000-00-0",
        name: "Structural Steel",
      },
    ]);
  });

  it("refuses a row whose stored name is neither the old nor the new one", () => {
    // This is the safety rule: an unexpected name means the workbook has since
    // said something else, and the workbook wins. Never overwrite it.
    expect(
      planCbsRenames([rename()], [row({ name: "Structural Steelwork" })]),
    ).toEqual([
      {
        kind: "stale",
        displayCode: "300-00-0000-00-0",
        actual: "Structural Steelwork",
        expected: "Structural Steel Shop Fabrication",
      },
    ]);
  });

  it("skips a display code the catalog doesn't have", () => {
    expect(planCbsRenames([rename()], [])).toEqual([
      { kind: "missing", displayCode: "300-00-0000-00-0" },
    ]);
  });

  it("checks 'already done' before 'unexpected', so a done rename isn't refused", () => {
    // Both rules match a row named `to` when `to` !== `from`; order decides.
    const outcomes = planCbsRenames(
      [rename({ from: "Old", to: "New" })],
      [row({ name: "New" })],
    );
    expect(outcomes[0].kind).toBe("current");
  });

  it("returns one outcome per rename, in the order declared", () => {
    const outcomes = planCbsRenames(
      [
        rename({ displayCode: "A", from: "a", to: "A!" }),
        rename({ displayCode: "B", from: "b", to: "B!" }),
        rename({ displayCode: "C", from: "c", to: "C!" }),
      ],
      [
        { id: 2, displayCode: "B", name: "b" },
        { id: 3, displayCode: "C", name: "nope" },
      ],
    );
    expect(outcomes.map((o) => [o.displayCode, o.kind])).toEqual([
      ["A", "missing"],
      ["B", "rename"],
      ["C", "stale"],
    ]);
  });

  it("matches on display code, not on position", () => {
    const outcomes = planCbsRenames(
      [rename({ displayCode: "600-00-0000-00-0", from: "Pipe Shop", to: "Piping" })],
      [
        { id: 1, displayCode: "300-00-0000-00-0", name: "Pipe Shop" },
        { id: 2, displayCode: "600-00-0000-00-0", name: "Pipe Shop" },
      ],
    );
    expect(outcomes).toEqual([
      {
        kind: "rename",
        displayCode: "600-00-0000-00-0",
        id: 2,
        from: "Pipe Shop",
        to: "Piping",
      },
    ]);
  });

  it("plans nothing for an empty rename table", () => {
    expect(planCbsRenames([], [row()])).toEqual([]);
  });
});

describe("cbsDisplayDescription", () => {
  it("rebuilds the stored description — code, two spaces, name", () => {
    // Matches what the workbook loader derives, so a renamed row's description
    // survives the next import unchanged.
    expect(cbsDisplayDescription("600-00-0000-00-0", "Piping")).toBe(
      "600-00-0000-00-0:  Piping",
    );
  });
});

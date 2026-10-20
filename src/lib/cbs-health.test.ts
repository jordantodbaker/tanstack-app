import { describe, expect, it } from "vitest";
import {
  check,
  FINDING_LIMIT,
  healthHeadline,
  passing,
  sortChecks,
  type HealthCheck,
  type HealthFinding,
} from "./cbs-health";

/**
 * The shapes behind the CBS Health page. These are the decisions a reader sees
 * first — which check sits at the top of the list, and what the one-line
 * headline claims — so they are worth pinning independently of the ~20 rules
 * that feed them (those are covered in `cbs-qc.test.ts`).
 */

const finding = (code: string, originalRow?: number | null): HealthFinding => ({
  code,
  name: `Account ${code}`,
  detail: "something is wrong",
  originalRow,
});

/** A failing check, since that is the interesting case for ordering. */
const failing = (id: string, over: Partial<HealthCheck> = {}): HealthCheck => ({
  id,
  title: id,
  severity: "error",
  count: 1,
  summary: "s",
  action: "a",
  findings: [],
  ...over,
});

describe("check", () => {
  it("uses the all-clear wording when nothing was found", () => {
    // "Nothing reported" and "never asked" must not look the same, so a clean
    // check still carries a sentence of its own.
    const c = check({
      id: "x",
      title: "X",
      severity: "error",
      findings: [],
      count: 0,
      summary: "this should not be shown",
      action: "nor this",
      clear: "Every row is fine.",
    });
    expect(c).toEqual({
      id: "x",
      title: "X",
      severity: "info",
      count: 0,
      summary: "Every row is fine.",
      action: "",
      findings: [],
    });
  });

  it("keeps count separate from the number of findings", () => {
    // A check may count rows while listing something coarser — one finding per
    // duplicated code, say, standing for several rows each.
    const c = check({
      id: "x",
      title: "X",
      severity: "warning",
      findings: [finding("601-00-0000-00-0", 5)],
      count: 97,
      summary: "s",
      action: "a",
      clear: "c",
    });
    expect(c.count).toBe(97);
    expect(c.findings).toHaveLength(1);
    expect(c.severity).toBe("warning");
  });

  it("returns findings in spreadsheet order, with no-row findings last", () => {
    // The list is worked down in CBS.xlsx, so it has to arrive sorted by the
    // row number rather than in whatever order the rule walked the catalog.
    const c = check({
      id: "x",
      title: "X",
      severity: "error",
      findings: [
        finding("c", 900),
        finding("d", null),
        finding("a", 100),
        finding("b", undefined),
      ],
      count: 4,
      summary: "s",
      action: "a",
      clear: "c",
    });
    // Both absent forms sort to the end, and tie there — so the display code
    // breaks it ("b" before "d"), which is what makes the order deterministic
    // rather than dependent on how the rule happened to walk the catalog.
    expect(c.findings.map((f) => f.code)).toEqual(["a", "c", "b", "d"]);
    expect(c.findings.slice(2).map((f) => f.originalRow ?? null)).toEqual([
      null,
      null,
    ]);
  });

  it("breaks a row-number tie on the display code", () => {
    const c = check({
      id: "x",
      title: "X",
      severity: "error",
      findings: [finding("602", 7), finding("601", 7)],
      count: 2,
      summary: "s",
      action: "a",
      clear: "c",
    });
    expect(c.findings.map((f) => f.code)).toEqual(["601", "602"]);
  });

  it("sorts before capping, so a clipped list keeps the earliest rows", () => {
    // The cap only exists to bound the payload. Slicing first would hand back
    // an arbitrary window of the catalog and call it the top of the worklist.
    const reversed = Array.from({ length: FINDING_LIMIT + 50 }, (_, i) =>
      finding(`code-${i}`, FINDING_LIMIT + 50 - i),
    );
    const c = check({
      id: "x",
      title: "X",
      severity: "error",
      findings: reversed,
      count: reversed.length,
      summary: "s",
      action: "a",
      clear: "c",
    });
    expect(c.findings).toHaveLength(FINDING_LIMIT);
    expect(c.findings[0].originalRow).toBe(1);
    // `count` still tells the truth about the tail that was dropped.
    expect(c.count).toBe(FINDING_LIMIT + 50);
  });

  it("does not mutate the findings it was handed", () => {
    const given = [finding("b", 2), finding("a", 1)];
    check({
      id: "x",
      title: "X",
      severity: "error",
      findings: given,
      count: 2,
      summary: "s",
      action: "a",
      clear: "c",
    });
    expect(given.map((f) => f.code)).toEqual(["b", "a"]);
  });
});

describe("passing", () => {
  it("is an info check with nothing to do", () => {
    expect(passing("x", "X", "All good.")).toEqual({
      id: "x",
      title: "X",
      severity: "info",
      count: 0,
      summary: "All good.",
      action: "",
      findings: [],
    });
  });
});

describe("sortChecks", () => {
  it("puts a clean check below a failing one even when it looks severe", () => {
    // The case this tier exists for. A check built through `check()` can never
    // reach it — `passing()` always downgrades a clean check to "info", so the
    // severity and count tiers would sort it last anyway. It bites on a
    // hand-built check, which the type allows and which the health report
    // itself produced until the workbook fallback moved to `passing()`.
    const cleanButSevere: HealthCheck = {
      id: "clean",
      title: "Clean",
      severity: "error",
      count: 0,
      summary: "nothing to report",
      action: "",
      findings: [],
    };
    const sorted = sortChecks([
      cleanButSevere,
      failing("broken", { severity: "info" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["broken", "clean"]);
  });

  it("sinks a passing check below a failing one of the same severity", () => {
    const sorted = sortChecks([
      passing("clean", "Clean", "fine"),
      failing("broken", { severity: "info" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["broken", "clean"]);
  });

  it("orders failing checks worst first", () => {
    const sorted = sortChecks([
      failing("info", { severity: "info" }),
      failing("warning", { severity: "warning" }),
      failing("error", { severity: "error" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["error", "warning", "info"]);
  });

  it("puts the bigger problem first within a severity", () => {
    const sorted = sortChecks([
      failing("small", { count: 3 }),
      failing("big", { count: 300 }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["big", "small"]);
  });

  it("falls back to the title so the order is stable run to run", () => {
    const sorted = sortChecks([
      failing("b", { title: "Beta" }),
      failing("a", { title: "Alpha" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("leaves the caller's array alone", () => {
    const given = [failing("b", { count: 1 }), failing("a", { count: 9 })];
    sortChecks(given);
    expect(given.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("healthHeadline", () => {
  it("says so plainly when every check passed", () => {
    expect(
      healthHeadline([passing("a", "A", "ok"), passing("b", "B", "ok")]),
    ).toBe("No problems found in the CBS catalog.");
  });

  it("treats an empty catalog of checks as nothing wrong", () => {
    // Rather than "0 of 0 checks found something — .".
    expect(healthHeadline([])).toBe("No problems found in the CBS catalog.");
  });

  it("counts the failing checks against the total asked", () => {
    const line = healthHeadline([
      failing("a", { severity: "error" }),
      passing("b", "B", "ok"),
      passing("c", "C", "ok"),
    ]);
    expect(line).toBe("1 of 3 checks found something — 1 needing attention.");
  });

  it("breaks the failures down by severity, worst first", () => {
    const line = healthHeadline([
      failing("w1", { severity: "warning" }),
      failing("e1", { severity: "error" }),
      failing("i1", { severity: "info" }),
      failing("w2", { severity: "warning" }),
    ]);
    expect(line).toBe(
      "4 of 4 checks found something — 1 needing attention, 2 worth a look, 1 for information.",
    );
  });

  it("leaves out a severity that found nothing", () => {
    // The "for information" clause is derived by subtraction, which is the
    // part that would quietly go wrong.
    const line = healthHeadline([failing("i1", { severity: "info" })]);
    expect(line).toBe("1 of 1 checks found something — 1 for information.");
    expect(line).not.toContain("needing attention");
    expect(line).not.toContain("worth a look");
  });
});

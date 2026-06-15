import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_CATEGORIES,
  DASHBOARD_WIDGET_IDS,
  makeIsVisible,
  orderedWidgets,
} from "./dashboard-widgets";

/**
 * Hand-maintained witness list. If you add or remove a widget in
 * `dashboard-widgets.ts`, update this list — the drift-guard tests below
 * fail until both sides match. Same pattern used elsewhere
 * (fef-helpers.test.ts, admin-invalidations.test.ts).
 */
const EXPECTED_WIDGET_IDS = [
  "evm",
  "cvr-stats",
  "fco-stats",
  "rfi-stats",
  "needs-attention",
  "cvr-by-status",
  "fco-by-status",
  "rfi-by-status",
  "cvr-by-risk",
  "cvr-by-discipline",
] as const;

describe("DASHBOARD_WIDGETS catalog", () => {
  it("drift guard: catalog ids match the hand-maintained expected list", () => {
    expect([...DASHBOARD_WIDGET_IDS].sort()).toEqual(
      [...EXPECTED_WIDGET_IDS].sort(),
    );
  });

  it("every widget's category is in the rendering-order list", () => {
    const known = new Set(DASHBOARD_WIDGET_CATEGORIES);
    for (const w of DASHBOARD_WIDGETS) {
      expect(known.has(w.category)).toBe(true);
    }
  });

  it("widget ids are unique", () => {
    const seen = new Set<string>();
    for (const w of DASHBOARD_WIDGETS) {
      expect(seen.has(w.id)).toBe(false);
      seen.add(w.id);
    }
  });

  it("widget labels are non-empty", () => {
    for (const w of DASHBOARD_WIDGETS) {
      expect(w.label.trim().length).toBeGreaterThan(0);
    }
  });

  // Hard-coupling guard: the dashboard route dispatches each widget through
  // a renderer keyed by id. Read the route's source and assert every
  // catalog id appears as a literal key. Catches the class of bug where a
  // widget is added to the catalog but never wired into the renderer map
  // (or vice-versa — a renderer for an id not in the catalog).
  it("every catalog id is wired into the dashboard route's renderer map", () => {
    const routePath = path.resolve(
      __dirname,
      "..",
      "routes",
      "dashboard.tsx",
    );
    const source = fs.readFileSync(routePath, "utf8");
    for (const id of DASHBOARD_WIDGET_IDS) {
      // Match either bare-key `evm:` or quoted-key `"cvr-stats":` in the
      // renderers object. Both are valid TS for a `Record<DashboardWidgetId, …>`.
      const bareKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id);
      const pattern = bareKey
        ? new RegExp(`(^|[\\s{,])${id}:\\s*\\(`, "m")
        : new RegExp(`"${id}":\\s*\\(`);
      expect(pattern.test(source)).toBe(true);
    }
  });
});

describe("makeIsVisible", () => {
  it("treats every catalog id as visible by default", () => {
    const isVisible = makeIsVisible([]);
    for (const id of DASHBOARD_WIDGET_IDS) {
      expect(isVisible(id)).toBe(true);
    }
  });

  it("hides ids listed in hiddenWidgets", () => {
    const isVisible = makeIsVisible(["cvr-stats", "needs-attention"]);
    expect(isVisible("cvr-stats")).toBe(false);
    expect(isVisible("needs-attention")).toBe(false);
    expect(isVisible("evm")).toBe(true);
  });

  it("silently ignores unknown ids in hiddenWidgets (stale prefs after a widget is removed)", () => {
    const isVisible = makeIsVisible(["removed-widget-id"]);
    for (const id of DASHBOARD_WIDGET_IDS) {
      expect(isVisible(id)).toBe(true);
    }
  });
});

describe("orderedWidgets", () => {
  it("returns catalog order when the user has no saved order", () => {
    const ordered = orderedWidgets([]);
    expect(ordered.map((w) => w.id)).toEqual([...DASHBOARD_WIDGET_IDS]);
  });

  it("respects the user's order for known ids", () => {
    const order = ["needs-attention", "evm", "cvr-stats"];
    const ordered = orderedWidgets(order);
    // First three are the user-specified ids in their declared order;
    // remaining catalog entries follow in catalog order.
    expect(ordered.slice(0, 3).map((w) => w.id)).toEqual(order);
    // Total length is still the full catalog — nothing dropped.
    expect(ordered.length).toBe(DASHBOARD_WIDGET_IDS.length);
  });

  it("appends catalog widgets not in the user's order to the end (new widget after a saved order)", () => {
    // Saved order missing one catalog id — the missing one should appear at
    // the end so a user who customized before a new widget shipped still
    // sees it (just at the bottom rather than disappearing).
    const order = DASHBOARD_WIDGET_IDS.slice(1);
    const ordered = orderedWidgets(order);
    expect(ordered.length).toBe(DASHBOARD_WIDGET_IDS.length);
    // The omitted (first catalog) id ends up at the end.
    expect(ordered[ordered.length - 1].id).toBe(DASHBOARD_WIDGET_IDS[0]);
  });

  it("silently drops stale ids that no longer match the catalog", () => {
    const order = [
      "removed-widget",
      "cvr-stats",
      "another-removed",
      "evm",
    ];
    const ordered = orderedWidgets(order);
    // Cast the mapped result to `string[]` so the inclusion checks accept
    // literal strings that aren't in the catalog's DashboardWidgetId union.
    const ids: string[] = ordered.map((w) => w.id);
    expect(ids).not.toContain("removed-widget");
    expect(ids).not.toContain("another-removed");
    // Total is still the catalog count.
    expect(ordered.length).toBe(DASHBOARD_WIDGET_IDS.length);
    // First two are still the two known ids in the user-given order.
    expect(ordered.slice(0, 2).map((w) => w.id)).toEqual([
      "cvr-stats",
      "evm",
    ]);
  });

  it("dedupes duplicate ids in the user's order", () => {
    const order = ["evm", "evm", "cvr-stats"];
    const ordered = orderedWidgets(order);
    expect(ordered.length).toBe(DASHBOARD_WIDGET_IDS.length);
    // Only one "evm" appears; it appears once and only once.
    const evmCount = ordered.filter((w) => w.id === "evm").length;
    expect(evmCount).toBe(1);
  });
});

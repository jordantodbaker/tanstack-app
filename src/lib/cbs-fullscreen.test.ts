import { describe, expect, it } from "vitest";
import { defaultParseSearch } from "@tanstack/react-router";
import {
  cbsNoCostTypes,
  cbsNoStatuses,
  cbsNoValues,
  type CbsRowFilterState,
} from "./cbs-tree";
import {
  CBS_FULLSCREEN_PATH,
  cbsFullscreenHref,
  cbsFullscreenSearch,
  cbsRowFilterStateFromSearch,
  isCbsFullscreenPath,
  parseCbsFullscreenSearch,
} from "./cbs-fullscreen";

/**
 * The URL between a tree's "Full screen" button and the tab it opens: what
 * the button writes, the route reads back unchanged, and nothing malformed
 * in a hand-edited link can fail the page.
 */

const none = (): CbsRowFilterState => ({
  query: "",
  rowType: "all",
  values: cbsNoValues(),
  costTypes: cbsNoCostTypes(),
  statuses: cbsNoStatuses(),
});

const busy = (): CbsRowFilterState => ({
  query: "pipe rack",
  rowType: "generated",
  values: {
    disciplines: ["Piping", "Home Office & Administration"],
    materialTypes: ["Bulks"],
    classifications: [],
  },
  costTypes: { ...cbsNoCostTypes(), labor: true, material: true },
  statuses: { ...cbsNoStatuses(), retired: true },
});

describe("cbsFullscreenSearch", () => {
  it("writes only the view when nothing is filtering", () => {
    expect(cbsFullscreenSearch("project", none())).toEqual({
      view: "project",
    });
  });

  it("writes every filter in force, the ungranted-parents choice and the selected row", () => {
    expect(
      cbsFullscreenSearch("dictionary", busy(), {
        hideContext: true,
        code: "600-00-0000-00-L",
      }),
    ).toEqual({
      view: "dictionary",
      q: "pipe rack",
      types: ["labor", "material"],
      statuses: ["retired"],
      rowType: "generated",
      disciplines: ["Piping", "Home Office & Administration"],
      materialTypes: ["Bulks"],
      hideContext: true,
      code: "600-00-0000-00-L",
    });
  });

  it("leaves out a search that is only whitespace", () => {
    expect(cbsFullscreenSearch("accounts", { ...none(), query: "  " })).toEqual(
      { view: "accounts" },
    );
  });
});

describe("the round trip", () => {
  it("survives the router's own query encoding and comes back as the same state", () => {
    const search = cbsFullscreenSearch("dictionary", busy(), {
      hideContext: true,
      code: "600-00-0000-00-L",
    });
    const href = cbsFullscreenHref(search);
    expect(href.startsWith(`${CBS_FULLSCREEN_PATH}?`)).toBe(true);
    const parsed = parseCbsFullscreenSearch(
      defaultParseSearch(href.slice(href.indexOf("?"))),
    );
    expect(parsed).toEqual(search);
    expect(cbsRowFilterStateFromSearch(parsed)).toEqual(busy());
  });

  it("keeps a search that looks like a number as text", () => {
    const search = cbsFullscreenSearch("project", { ...none(), query: "012" });
    const href = cbsFullscreenHref(search);
    const parsed = parseCbsFullscreenSearch(
      defaultParseSearch(href.slice(href.indexOf("?"))),
    );
    expect(parsed.q).toBe("012");
  });
});

describe("parseCbsFullscreenSearch", () => {
  it("falls back to the project view and drops what it does not recognise", () => {
    expect(
      parseCbsFullscreenSearch({
        view: "everything",
        q: 7,
        types: ["labor", "bogus", 3],
        statuses: "retired",
        rowType: "sometimes",
        disciplines: "Piping",
        hideContext: "yes",
        code: "",
      }),
    ).toEqual({
      view: "project",
      types: ["labor"],
      statuses: ["retired"],
      disciplines: ["Piping"],
    });
  });

  it("reads 'all' as no Row Type filter", () => {
    expect(
      parseCbsFullscreenSearch({ view: "dictionary", rowType: "all" }),
    ).toEqual({
      view: "dictionary",
    });
  });
});

describe("cbsRowFilterStateFromSearch", () => {
  it("is the empty state for a bare view", () => {
    expect(cbsRowFilterStateFromSearch({ view: "project" })).toEqual(none());
  });
});

describe("isCbsFullscreenPath", () => {
  it("matches the route and nothing beneath or beside it", () => {
    expect(isCbsFullscreenPath("/cbs-fullscreen")).toBe(true);
    expect(isCbsFullscreenPath("/cbs-fullscreen/x")).toBe(false);
    expect(isCbsFullscreenPath("/project-cost-codes")).toBe(false);
  });
});

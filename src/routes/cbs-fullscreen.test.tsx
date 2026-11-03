// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The full-screen tab: one tree, filling the window, started from the URL.
 * Checks that the search params land in the toolbar and on the rows, that the
 * catalog views make the same cut the Admin → Master CBS sections make, and
 * that the tab does not offer to open yet another full-screen tab.
 */

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 29,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 29,
        size: 29,
        key: index,
      })),
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));
vi.mock("~/utils/cbsExport", () => ({
  cbsExporterFor: () => vi.fn(async () => ({ filename: "x.xlsx", base64: "" })),
}));
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: 1,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

// The fill-height hook observes the document; happy-dom may not ship one.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

import { CbsFullscreenPage } from "./cbs-fullscreen";
import { cbsCatalogQueryOptions, type CbsTreeRow } from "~/utils/cbs";
import { parseCbsDisplayCode } from "~/lib/cbs-tree";
import type { CbsFullscreenSearch } from "~/lib/cbs-fullscreen";

afterEach(cleanup);

let nextId = 1;
function item(
  displayCode: string,
  name: string,
  over: Partial<CbsTreeRow> = {},
): CbsTreeRow {
  return {
    id: nextId++,
    ...parseCbsDisplayCode(displayCode),
    displayCode,
    name,
    uom: "LS",
    accountDescription: name,
    subReporting: null,
    materialCode: null,
    laborCode: null,
    equipmentCode: null,
    otherCode: null,
    rentalCode: null,
    status: "Active",
    costClassification: null,
    materialType: null,
    discipline: null,
    isOriginal: null,
    ...over,
  };
}

const CATALOG: CbsTreeRow[] = [
  item("600-00-0000-00-0", "Pipe (*)", { discipline: "Piping" }),
  item("600-00-0000-00-L", "Pipe Labor (L)", { discipline: "Piping" }),
  item("600-00-0000-00-M", "Pipe Materials (M)", { discipline: "Piping" }),
  item("100-00-0000-00-0", "Civil (*)", { discipline: "Civil" }),
  item("100-00-0000-00-L", "Civil Labor (L)", {
    discipline: "Civil",
    status: "Retired",
  }),
];

function renderPage(search: CbsFullscreenSearch) {
  const client = new QueryClient();
  client.setQueryData(cbsCatalogQueryOptions().queryKey, CATALOG);
  return render(
    <QueryClientProvider client={client}>
      <CbsFullscreenPage search={search} />
    </QueryClientProvider>,
  );
}

const rowNames = () =>
  within(screen.getByRole("tree"))
    .getAllByRole("treeitem")
    .map((r) => r.textContent ?? "");

describe("CbsFullscreenPage", () => {
  it("opens the dictionary with the URL's filters in force", async () => {
    renderPage({
      view: "dictionary",
      q: "pipe",
      types: ["labor"],
      disciplines: ["Piping"],
    });
    expect(
      screen.getByRole("heading", { name: "CBS Dictionary" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Labor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("searchbox")).toHaveValue("pipe");
    expect(
      screen.getByRole("button", { name: /^Discipline:/ }),
    ).toHaveTextContent("Piping");
    // Only the Piping labor line survives all three.
    expect(await screen.findByText("1 match")).toBeTruthy();
    expect(rowNames().join("|")).toContain("Pipe Labor (L)");
    expect(rowNames().join("|")).not.toContain("Pipe Materials (M)");
  });

  it("offers Status and Row Type on the dictionary only", () => {
    renderPage({ view: "dictionary" });
    expect(
      screen.getByRole("group", { name: "Filter by status" }),
    ).toBeTruthy();
    cleanup();
    renderPage({ view: "accounts" });
    expect(
      screen.queryByRole("group", { name: "Filter by status" }),
    ).toBeNull();
  });

  it("lists active codes only as Cost Accounts, everything as the Dictionary", () => {
    renderPage({ view: "accounts" });
    expect(screen.getByRole("heading", { name: "Cost Accounts" })).toBeTruthy();
    expect(screen.getByText("4 rows")).toBeTruthy();
    cleanup();
    renderPage({ view: "dictionary" });
    expect(screen.getByText("5 rows")).toBeTruthy();
  });

  it("opens on the linked row, selected", () => {
    renderPage({ view: "accounts", code: "600-00-0000-00-M" });
    expect(
      within(screen.getByRole("tree")).getByText("Pipe Materials (M)"),
    ).toBeTruthy();
    // The detail panel's header names the selected row.
    expect(screen.getByRole("button", { name: "Close details" })).toBeTruthy();
  });

  it("does not offer to open another full-screen tab, but still copies links", () => {
    renderPage({ view: "accounts", code: "600-00-0000-00-M" });
    expect(screen.queryByRole("link", { name: /Full screen/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy link to this code" }),
    ).toBeTruthy();
    // Filters still work in the tab — the toolbar owns them from here.
    fireEvent.click(screen.getByRole("button", { name: "Materials" }));
    expect(rowNames().join("|")).not.toContain("Pipe Labor (L)");
  });
});

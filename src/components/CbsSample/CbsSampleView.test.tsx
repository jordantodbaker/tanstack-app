// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";

// jsdom has no layout, so the real virtualizer would render 0 rows. Stub it to
// render every row — these tests exercise the tree logic (flatten/colour/search),
// not the windowing itself.
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
  }),
}));

import { CbsSampleView } from "./CbsSampleView";

afterEach(cleanup);

describe("CbsSampleView", () => {
  it("renders the page heading and both collapsible sections", () => {
    render(<CbsSampleView />);
    expect(
      screen.getByRole("heading", { name: "CBS Sample" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CBS Code Book/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Master CBS Dictionary/ }),
    ).toBeInTheDocument();
  });

  it("lazy-loads a section and colours its L0 roots red", async () => {
    render(<CbsSampleView />);
    // Both sections are open by default, so "Civil" renders in each.
    const civils = await screen.findAllByText("Civil", {}, { timeout: 20000 });
    const row = civils[0].closest('[role="treeitem"]');
    expect(row).not.toBeNull();
    // L0 (discipline roots) is overridden to red to distinguish it from L1 gold.
    expect(row).toHaveStyle({ backgroundColor: "#C0504D" });
  }, 25000);

  it("loads the Master CBS Dictionary by default (expanded)", async () => {
    render(<CbsSampleView />);
    // Open by default → the dictionary (3,573 rows) resolves with no click.
    const counts = await screen.findAllByText(/3,573 rows/, {}, { timeout: 20000 });
    expect(counts.length).toBeGreaterThan(0);
  }, 25000);

  it("filters a section by search query", async () => {
    render(<CbsSampleView />);
    await screen.findAllByText("Civil", {}, { timeout: 20000 }); // sections loaded
    const search = screen.getAllByRole("searchbox")[0]; // the Code Book section
    fireEvent.change(search, { target: { value: "Topsoil" } });
    const tree = screen.getAllByRole("tree")[0];
    expect(await within(tree).findByText("Topsoil")).toBeInTheDocument();
  }, 25000);
});

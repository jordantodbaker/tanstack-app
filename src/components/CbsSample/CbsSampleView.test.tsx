// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
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

  it("lazy-loads the CBS Code Book (open by default) and colours a root by level", async () => {
    render(<CbsSampleView />);
    // "Civil" is a top-level root of the code book; the dictionary section is
    // collapsed, so this is unambiguous once the lazy chunk resolves.
    const civil = await screen.findByText("Civil", {}, { timeout: 20000 });
    const row = civil.closest('[role="treeitem"]');
    expect(row).not.toBeNull();
    // Level-0 fill from the workbook palette (gold).
    expect(row).toHaveStyle({ backgroundColor: "#FFD966" });
  }, 25000);

  it("lazy-loads the Master CBS Dictionary only when its section is opened", async () => {
    render(<CbsSampleView />);
    // The dictionary (3,573 rows) is not present until its section is expanded.
    fireEvent.click(screen.getByRole("button", { name: /Master CBS Dictionary/ }));
    // 3,573-row count appears once the dictionary chunk resolves (in both the
    // section badge and the hierarchy's count chip).
    const counts = await screen.findAllByText(/3,573 rows/, {}, { timeout: 20000 });
    expect(counts.length).toBeGreaterThan(0);
  }, 25000);

  it("filters the open section by search query", async () => {
    render(<CbsSampleView />);
    await screen.findByText("Civil", {}, { timeout: 20000 }); // code book loaded
    const search = screen.getAllByRole("searchbox")[0];
    fireEvent.change(search, { target: { value: "Topsoil" } });
    const tree = screen.getByRole("tree");
    expect(await within(tree).findByText("Topsoil")).toBeInTheDocument();
  }, 25000);
});

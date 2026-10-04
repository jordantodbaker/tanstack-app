// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CbsSampleView } from "./CbsSampleView";

afterEach(cleanup);

describe("CbsSampleView", () => {
  it("renders the heading, counts, and the top-level CBS disciplines", () => {
    render(<CbsSampleView />);
    expect(
      screen.getByRole("heading", { name: "CBS Sample" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/rows$/)).toBeInTheDocument();
    // Roots are expanded by default, so the discipline rows are present.
    expect(screen.getByText("Civil")).toBeInTheDocument();
    expect(screen.getByText("Pipe Shop")).toBeInTheDocument();
  });

  it("paints each level with the workbook's fill colour (hierarchy by colour)", () => {
    render(<CbsSampleView />);
    // Civil is a level-0/1 row → gold (#FFD966) per the workbook palette.
    const civilRow = screen.getByText("Civil").closest('[role="treeitem"]');
    expect(civilRow).not.toBeNull();
    expect(civilRow).toHaveStyle({ backgroundColor: "#FFD966" });
  });

  it("collapses and expands a node", () => {
    render(<CbsSampleView />);
    // Collapse everything, then a deep child should be gone.
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Civil Shop Materials")).toBeNull();
    // Civil root is still shown; expanding it brings its children back.
    const civilRow = screen.getByText("Civil").closest('[role="treeitem"]')!;
    fireEvent.click(within(civilRow).getByRole("button", { name: "Expand" }));
    expect(screen.getAllByText(/Civil/).length).toBeGreaterThan(1);
  });

  it("filters by search query", () => {
    render(<CbsSampleView />);
    fireEvent.change(screen.getByRole("searchbox", { name: /search the cbs/i }), {
      target: { value: "Topsoil" },
    });
    expect(screen.getByText("Topsoil")).toBeInTheDocument();
    expect(screen.getByText(/match/)).toBeInTheDocument();
    // A non-matching sibling discipline's leaf is pruned out.
    expect(screen.queryByText("Coatings & Insulation")).toBeNull();
  });
});

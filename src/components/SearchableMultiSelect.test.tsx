// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchableMultiSelect } from "./SearchableMultiSelect";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana", searchText: "banana yellow fruit" },
  { value: "c", label: "Cherry" },
];

/** Render and open the dropdown; returns the onChange spy. */
function open(props: Partial<React.ComponentProps<typeof SearchableMultiSelect>> = {}) {
  const onChange = vi.fn();
  render(
    <SearchableMultiSelect
      values={[]}
      options={OPTIONS}
      onChange={onChange}
      {...props}
    />,
  );
  // Click the "▾" indicator — always on the trigger regardless of whether the
  // placeholder or a "N selected" summary is showing.
  fireEvent.click(screen.getByText("▾"));
  return { onChange };
}

describe("SearchableMultiSelect", () => {
  it("stays closed until clicked and shows the placeholder", () => {
    render(<SearchableMultiSelect values={[]} options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByText("-- Select --")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("summarizes the selection count and renders removable chips", () => {
    const onChange = vi.fn();
    render(
      <SearchableMultiSelect values={["a", "c"]} options={OPTIONS} onChange={onChange} />,
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(onChange).toHaveBeenCalledWith(["c"]); // 'a' toggled off
  });

  it("opens to reveal a search box and all options", () => {
    open();
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  it("filters client-side by label and by searchText", () => {
    open();
    const box = screen.getByPlaceholderText("Search…");
    fireEvent.change(box, { target: { value: "yellow" } }); // matches Banana's searchText
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("shows 'No matches' when nothing matches the query", () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("adds an unselected option to the values on click", () => {
    const { onChange } = open({ values: ["a"] });
    fireEvent.click(screen.getByText("Banana"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("removes an already-selected option on click", () => {
    const { onChange } = open({ values: ["a", "b"] });
    fireEvent.click(screen.getByText("Apple"));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("closes on Escape", () => {
    open();
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("caps the rendered list and notes how many are hidden", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      value: `v${i}`,
      label: `Option ${i}`,
    }));
    const onChange = vi.fn();
    render(<SearchableMultiSelect values={[]} options={many} onChange={onChange} />);
    fireEvent.click(screen.getByText("-- Select --"));
    expect(screen.getByText("+20 more — refine your search")).toBeInTheDocument();
  });

  describe("async mode (parent-owned search)", () => {
    it("reports the query and does NOT re-filter the server-provided options", () => {
      const onSearchChange = vi.fn();
      const { onChange } = open({ onSearchChange });
      fireEvent.change(screen.getByPlaceholderText("Search…"), {
        target: { value: "xyz" },
      });
      // Term forwarded to the parent…
      expect(onSearchChange).toHaveBeenCalledWith("xyz");
      // …and the (already server-filtered) options remain visible.
      expect(screen.getByText("Apple")).toBeInTheDocument();
      expect(screen.getByText("Banana")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("shows 'Searching…' while a fetch is in flight with no options yet", () => {
      const onChange = vi.fn();
      render(
        <SearchableMultiSelect
          values={[]}
          options={[]}
          onChange={onChange}
          onSearchChange={vi.fn()}
          loading
        />,
      );
      fireEvent.click(screen.getByText("-- Select --"));
      expect(screen.getByText("Searching…")).toBeInTheDocument();
    });
  });
});

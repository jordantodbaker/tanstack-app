// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchableSelect, type SearchableSelectOption } from "./SearchableSelect";

afterEach(cleanup);

const OPTIONS: SearchableSelectOption[] = [
  {
    value: "101-05-0500-00-0",
    label: "101-05-0500-00-0: Topsoil",
    shortLabel: "Topsoil",
    searchText: "101-05-0500-00-0 topsoil",
  },
  {
    value: "101-05-1000-00-0",
    label: "101-05-1000-00-0: Site/Road Excavation",
    shortLabel: "Site/Road Excavation",
    searchText: "101-05-1000-00-0 site/road excavation",
  },
];

const trigger = () => screen.getAllByRole("button")[0];

/**
 * Put the trigger somewhere specific in a known viewport. happy-dom reports a
 * zeroed rect for everything, so the panel's geometry can only be tested by
 * supplying one.
 */
function placeTrigger(rect: Partial<DOMRect>, viewport = { w: 1280, h: 800 }) {
  window.innerWidth = viewport.w;
  window.innerHeight = viewport.h;
  const full = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(full);
}

const panel = () => document.querySelector<HTMLElement>(".fixed");


describe("SearchableSelect", () => {
  it("rests on the short label, and lists the full label when open", () => {
    // A grid cell shows just the item name; the code has its own column. The
    // open list still identifies each option by code, which is what you search.
    render(
      <SearchableSelect
        value="101-05-0500-00-0"
        options={OPTIONS}
        onSelect={vi.fn()}
      />,
    );
    expect(trigger()).toHaveTextContent("Topsoil");
    expect(trigger()).not.toHaveTextContent("101-05-0500-00-0");

    fireEvent.click(trigger());
    expect(screen.getByText("101-05-0500-00-0: Topsoil")).toBeInTheDocument();
  });

  it("falls back to the full label when an option has no short one", () => {
    render(
      <SearchableSelect
        value="A"
        options={[{ value: "A", label: "A: Thing" }]}
        onSelect={vi.fn()}
      />,
    );
    expect(trigger()).toHaveTextContent("A: Thing");
  });

  it("falls back to the raw value when the option isn't in the list", () => {
    // Server-paged lists may not contain the saved option; show its code
    // rather than reverting to the placeholder.
    render(
      <SearchableSelect value="999-00-0000-00-0" options={OPTIONS} onSelect={vi.fn()} />,
    );
    expect(trigger()).toHaveTextContent("999-00-0000-00-0");
  });

  it("shows the placeholder when nothing is selected", () => {
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    expect(trigger()).toHaveTextContent("-- Select --");
  });

  it("filters the list as you type, matching code or name", () => {
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());
    const search = screen.getByRole("textbox");

    fireEvent.change(search, { target: { value: "topsoil" } });
    expect(screen.getByText("101-05-0500-00-0: Topsoil")).toBeInTheDocument();
    expect(screen.queryByText(/Site\/Road Excavation/)).toBeNull();

    // Searching by code works too — that is the point of the full label.
    fireEvent.change(search, { target: { value: "1000" } });
    expect(
      screen.getByText("101-05-1000-00-0: Site/Road Excavation"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Topsoil/)).toBeNull();
  });

  it("says so when nothing matches", () => {
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "nothing here" },
    });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("reports the chosen option's value", () => {
    const onSelect = vi.fn();
    render(<SearchableSelect value="" options={OPTIONS} onSelect={onSelect} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByText("101-05-0500-00-0: Topsoil"));
    expect(onSelect).toHaveBeenCalledWith("101-05-0500-00-0");
  });

  it("reports an empty value when the placeholder is chosen, to clear the cell", () => {
    const onSelect = vi.fn();
    render(
      <SearchableSelect
        value="101-05-0500-00-0"
        options={OPTIONS}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(trigger());
    // The placeholder row inside the open list, not the trigger.
    const rows = screen.getAllByText("-- Select --");
    fireEvent.click(rows[rows.length - 1]);
    expect(onSelect).toHaveBeenCalledWith("");
  });
});

describe("SearchableSelect panel placement", () => {
  afterEach(() => vi.restoreAllMocks());

  it("paints in a fixed layer above the grid, not clipped inside it", () => {
    // The take-off grid scrolls inside an overflow-auto box whose sticky header
    // and frozen columns sit at z-20/z-30. An absolutely-positioned panel was
    // clipped to the table and painted under the header; this is that guard.
    placeTrigger({ top: 300, bottom: 324, left: 400, width: 300, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());

    const el = panel();
    expect(el).not.toBeNull();
    expect(el!.className).toContain("fixed");
    expect(el!.className).not.toContain("absolute");
    expect(el!.className).toContain("z-50");
  });

  it("anchors just below the trigger when there is room", () => {
    placeTrigger({ top: 300, bottom: 324, left: 400, width: 300, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());

    const el = panel()!;
    expect(parseFloat(el.style.top)).toBeGreaterThan(324);
    expect(parseFloat(el.style.left)).toBe(400);
    expect(el.style.visibility).toBe("visible");
  });

  it("flips above the trigger near the bottom of the viewport", () => {
    // A row near the foot of a long sheet would otherwise open off-screen.
    placeTrigger({ top: 770, bottom: 794, left: 400, width: 300, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());

    const el = panel()!;
    expect(parseFloat(el.style.top)).toBeLessThan(770);
  });

  it("keeps a right-edge cell on screen", () => {
    placeTrigger({ top: 300, bottom: 324, left: 1240, width: 40, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());

    const el = panel()!;
    const left = parseFloat(el.style.left);
    const width = parseFloat(el.style.width);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + width).toBeLessThanOrEqual(1280);
  });

  it("is at least readable-width even in a narrow cell", () => {
    placeTrigger({ top: 300, bottom: 324, left: 100, width: 60, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());
    expect(parseFloat(panel()!.style.width)).toBeGreaterThan(60);
  });

  it("matches a wide cell's width rather than shrinking to a fixed size", () => {
    placeTrigger({ top: 300, bottom: 324, left: 100, width: 420, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());
    expect(parseFloat(panel()!.style.width)).toBe(420);
  });

  it("re-anchors when the grid scrolls under it", () => {
    placeTrigger({ top: 300, bottom: 324, left: 400, width: 300, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());
    const before = parseFloat(panel()!.style.top);

    // The cell moved up; a fixed panel would otherwise stay where it was.
    placeTrigger({ top: 120, bottom: 144, left: 400, width: 300, height: 24 });
    fireEvent.scroll(window);
    expect(parseFloat(panel()!.style.top)).toBeLessThan(before);
  });

  it("stays open when the panel itself is clicked", () => {
    placeTrigger({ top: 300, bottom: 324, left: 400, width: 300, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(screen.getByRole("textbox"));
    expect(panel()).not.toBeNull();
  });

  it("closes on an outside click and on Escape", () => {
    placeTrigger({ top: 300, bottom: 324, left: 400, width: 300, height: 24 });
    render(<SearchableSelect value="" options={OPTIONS} onSelect={vi.fn()} />);

    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(panel()).toBeNull();

    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel()).toBeNull();
  });
});

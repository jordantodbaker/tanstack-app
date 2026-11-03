// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  AreaField,
  CommaListInput,
  LinkedRecordSelect,
  parseCommaList,
} from "./EntityFields";

/**
 * The fields the entity dialogs share. Each used to be written out per
 * dialog; these pin the behaviour the copies had in common.
 */

afterEach(cleanup);

describe("parseCommaList", () => {
  it("splits on commas and newlines, trims, and drops blanks", () => {
    expect(parseCommaList(" P-101-A, M-303-B ,,\nS-1 ")).toEqual([
      "P-101-A",
      "M-303-B",
      "S-1",
    ]);
    expect(parseCommaList("")).toEqual([]);
  });
});

describe("CommaListInput", () => {
  it("shows the list as text, commits the parsed list on blur, not per keystroke", () => {
    const onChange = vi.fn();
    render(<CommaListInput value={["A", "B"]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("A, B");
    fireEvent.change(input, { target: { value: "A, B, C" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(["A", "B", "C"]);
  });

  it("re-reads the list when it changes from outside", () => {
    const { rerender } = render(
      <CommaListInput value={["A"]} onChange={() => {}} />,
    );
    rerender(<CommaListInput value={["X", "Y"]} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("X, Y");
  });
});

describe("LinkedRecordSelect", () => {
  it("reads null as the none entry and writes null back for it", () => {
    const onChange = vi.fn();
    render(
      <LinkedRecordSelect
        value={null}
        onChange={onChange}
        options={[{ id: 7, label: "RFI-007 — Bolts" }]}
        noneLabel="— Not linked —"
      />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByText("— Not linked —")).toBeTruthy();
  });
});

describe("AreaField", () => {
  function renderField(
    projectId: number | null,
    areas: { id: number; displayId: string; name: string }[] = [],
  ) {
    const qc = new QueryClient();
    if (projectId !== null) {
      qc.setQueryData(areasByProjectQueryOptions(projectId).queryKey, areas);
    }
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <AreaField projectId={projectId} value="" onChange={onChange} />
      </QueryClientProvider>,
    );
    return onChange;
  }

  it("lists the project's areas as 'display id — name' after the none entry", () => {
    const onChange = renderField(1, [
      { id: 3, displayId: "A-03", name: "North Yard" },
      { id: 4, displayId: "A-04", name: "" },
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["— None —", "A-03 — North Yard", "A-04"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("explains an empty list, and a missing project", () => {
    renderField(1, []);
    expect(screen.getByText(/No areas defined/)).toBeTruthy();
    cleanup();
    renderField(null);
    expect(screen.getByText("Select a project first.")).toBeTruthy();
  });
});

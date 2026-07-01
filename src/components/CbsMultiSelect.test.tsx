// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CbsMultiSelect } from "./CbsMultiSelect";
import { cbsCodeSearchQueryOptions } from "~/utils/cbs";

afterEach(cleanup);

// Server search results for the initial (empty) query. One with a name, one
// without — exercising the label-mapping branch in CbsMultiSelect.
const RESULTS = [
  { displayCode: "601-10-0000-00-L", name: "Piping Installed" },
  { displayCode: "611-LB-0000-00-C", name: "" }, // unnamed → label is the bare code
];

function renderPicker(values: string[] = [], onChange = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
  // Seed the empty-query result so the debounced server fn never runs.
  qc.setQueryData(cbsCodeSearchQueryOptions("").queryKey, RESULTS);
  render(
    <QueryClientProvider client={qc}>
      <CbsMultiSelect values={values} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
}

describe("CbsMultiSelect", () => {
  it("maps catalog results to '<code> — <name>' options (code-only when unnamed)", () => {
    renderPicker();
    fireEvent.click(screen.getByText("Search CBS items…"));
    expect(
      screen.getByText("601-10-0000-00-L — Piping Installed"),
    ).toBeInTheDocument();
    // No name → label is the bare code.
    expect(screen.getByText("611-LB-0000-00-C")).toBeInTheDocument();
  });

  it("selects a code by its displayCode value on click", () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByText("Search CBS items…"));
    fireEvent.click(screen.getByText("601-10-0000-00-L — Piping Installed"));
    expect(onChange).toHaveBeenCalledWith(["601-10-0000-00-L"]);
  });

  it("renders a chip for a value even before results load", () => {
    renderPicker(["999-XX-0000-00-Z"]);
    // The chip renders from the raw value, independent of the result page.
    expect(screen.getByText("999-XX-0000-00-Z")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove 999-XX-0000-00-Z" }),
    ).toBeInTheDocument();
  });
});

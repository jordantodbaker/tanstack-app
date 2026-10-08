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

// jsdom has no layout, so the real virtualizer would render 0 rows. Stub it to
// render every row.
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

// The page must not depend on the selected project. Fix it to null — the
// hardest case for a project-scoped page — and assert rows still render.
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: null,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

import { Route } from "./admin.master-cbs";
import { cbsCatalogQueryOptions, type CbsTreeRow } from "~/utils/cbs";
import { parseCbsDisplayCode } from "~/lib/cbs-tree";

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
    rowType: "ORIGINAL",
    subReporting: null,
    materialCode: null,
    ...over,
  };
}

const CATALOG: CbsTreeRow[] = [
  item("100-00-0000-00-0", "Civil", { subReporting: true }),
  item("100-00-0000-00-S", "Civil Subcontracts", { rowType: "SUB" }),
  item("600-00-0000-00-0", "Pipe Shop"),
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(cbsCatalogQueryOptions().queryKey, CATALOG);
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
}

describe("Admin → CBS", () => {
  it("renders the whole catalog with no project selected", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "CBS" }),
    ).toBeInTheDocument();
    // Both disciplines are listed even though no project is selected.
    expect(screen.getAllByText("Civil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pipe Shop").length).toBeGreaterThan(0);
  });

  it("splits originals from the full dictionary, as the Code Book split does", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: /CBS Code Book/ }),
    ).toHaveTextContent("2 rows");
    expect(
      screen.getByRole("button", { name: /CBS Dictionary/ }),
    ).toHaveTextContent("3 rows");

    // The generated twin hangs under its root, so open both sections fully.
    for (const btn of screen.getAllByRole("button", { name: "Expand all" })) {
      fireEvent.click(btn);
    }
    const [codeBook, dictionary] = screen.getAllByRole("tree");
    expect(within(codeBook).queryByText("Civil Subcontracts")).toBeNull();
    expect(
      within(dictionary).getByText("Civil Subcontracts"),
    ).toBeInTheDocument();
  });

  it("badges Code Book rows by their own flags", () => {
    renderPage();
    const codeBook = screen.getAllByRole("tree")[0];
    const civil = within(codeBook)
      .getByText("Civil")
      .closest('[role="treeitem"]')! as HTMLElement;
    expect(within(civil).getByTitle("Sub Code: YES")).toHaveTextContent("S");
  });

  it("says the catalog is unfiltered, not project-scoped", () => {
    renderPage();
    expect(
      screen.getAllByText(/no project allow-list applied/).length,
    ).toBeGreaterThan(0);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

// Fix the selected project so the component renders without localStorage
// hydration, and so our seeded query key (projectId 1) lines up.
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: 1,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

import { ProjectCostCodeListView } from "./ProjectCostCodeListView";
import {
  projectCbsDictionaryQueryOptions,
  type ProjectCbsDictionaryItem,
} from "~/utils/cbs";
import { parseCbsDisplayCode } from "~/lib/cbs-tree";

afterEach(cleanup);

let nextId = 1;
function item(
  displayCode: string,
  name: string,
  over: Partial<ProjectCbsDictionaryItem> = {},
): ProjectCbsDictionaryItem {
  return {
    id: nextId++,
    ...parseCbsDisplayCode(displayCode),
    displayCode,
    name,
    uom: "LS",
    accountDescription: name,
    l2Description: null,
    rowType: "ORIGINAL",
    subReporting: null,
    materialCode: null,
    ...over,
  };
}

// A small slice of the Civil dictionary: a root carrying both flags, its
// generated M twin (which must NOT be listed), an L1 account and a leaf.
const FIXTURE: ProjectCbsDictionaryItem[] = [
  item("100-00-0000-00-0", "Civil", { subReporting: true, materialCode: true }),
  item("100-00-0000-00-M", "Civil Materials", { rowType: "MATERIAL" }),
  item("101-00-0000-00-0", "Civil Shop Materials", { materialCode: true }),
  item("101-05-0000-00-0", "Earthwork & Trenching"),
  item("101-05-0500-00-0", "Topsoil", { uom: "CY" }),
];

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectCbsDictionaryQueryOptions(1).queryKey, FIXTURE);
  return render(
    <QueryClientProvider client={qc}>
      <ProjectCostCodeListView />
    </QueryClientProvider>,
  );
}

describe("ProjectCostCodeListView", () => {
  it("renders the page heading", () => {
    renderView();
    expect(
      screen.getByRole("heading", { name: "Project Cost Code List" }),
    ).toBeInTheDocument();
  });

  it("shows a single list, with no collapsible sections", () => {
    renderView();
    expect(screen.getAllByRole("tree")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /CBS Code Book/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Master CBS Dictionary/ }),
    ).toBeNull();
  });

  it("lists original rows only, never the generated S/M rows", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    const tree = screen.getByRole("tree");
    expect(within(tree).getByText("Civil")).toBeInTheDocument();
    expect(within(tree).getByText("Topsoil")).toBeInTheDocument();
    expect(within(tree).queryByText("Civil Materials")).toBeNull();
    // 5 fixture rows minus the one generated row.
    expect(screen.getByText("4 rows")).toBeInTheDocument();
  });

  it("omits the row-type breakdown, which would always read zero", () => {
    renderView();
    expect(screen.queryByText(/original ·/)).toBeNull();
  });

  it("badges a code by its own Sub Code / Material Code", () => {
    renderView();
    const tree = screen.getByRole("tree");
    const civil = within(tree)
      .getByText("Civil")
      .closest('[role="treeitem"]')! as HTMLElement;
    expect(within(civil).getByTitle("Sub Code: YES")).toHaveTextContent("S");
    expect(within(civil).getByTitle("Material Code: YES")).toHaveTextContent("M");

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    const earthwork = within(tree)
      .getByText("Earthwork & Trenching")
      .closest('[role="treeitem"]')! as HTMLElement;
    expect(within(earthwork).queryByTitle(/Code: YES/)).toBeNull();
  });

  it("colours the L0 discipline roots red", () => {
    renderView();
    const row = screen.getByText("Civil").closest('[role="treeitem"]');
    expect(row).toHaveStyle({ backgroundColor: "#C0504D" });
  });

  it("filters by search query", async () => {
    renderView();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Topsoil" },
    });
    const tree = screen.getByRole("tree");
    expect(await within(tree).findByText("Topsoil")).toBeInTheDocument();
    // Ancestors stay so the match is reachable.
    expect(within(tree).getByText("Earthwork & Trenching")).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });
});

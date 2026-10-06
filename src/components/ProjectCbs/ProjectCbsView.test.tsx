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

import { ProjectCbsView } from "./ProjectCbsView";
import {
  projectCbsDictionaryQueryOptions,
  type ProjectCbsDictionaryItem,
} from "~/utils/cbs";

afterEach(cleanup);

let nextId = 1;
function item(
  displayCode: string,
  name: string,
  over: Partial<ProjectCbsDictionaryItem> = {},
): ProjectCbsDictionaryItem {
  return {
    id: nextId++,
    l1: displayCode.slice(0, 3),
    l2: displayCode.slice(4, 6),
    l3: displayCode.slice(7, 9),
    l4: displayCode.slice(9, 11),
    l5: displayCode.slice(12, 14),
    l6: displayCode.slice(15, 16),
    displayCode,
    costCode: displayCode.replace(/-/g, ""),
    name,
    uom: "LS",
    rowType: "ORIGINAL",
    generatedFrom: null,
    subReporting: null,
    materialCode: null,
    materialType: null,
    costCenter: null,
    costClassification: null,
    status: "Active",
    accountDescription: name,
    l2Description: null,
    core: null,
    coreExtension: null,
    wbs: null,
    p6CostAccount: null,
    gl: null,
    discipline: null,
    description: null,
    notes: null,
    ...over,
  };
}

// A small slice of the Civil dictionary: a root, its generated M twin, an L1
// account and a leaf under it.
const FIXTURE: ProjectCbsDictionaryItem[] = [
  item("100-00-0000-00-0", "Civil", { subReporting: true, materialCode: true }),
  item("100-00-0000-00-M", "Civil Materials", {
    rowType: "MATERIAL",
    generatedFrom: "100-00-0000-00-0",
    gl: "5100",
  }),
  item("101-00-0000-00-0", "Civil Shop Materials"),
  item("101-05-0000-00-0", "Earthwork & Trenching"),
  item("101-05-0500-00-M", "Topsoil", { uom: "CY" }),
];

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectCbsDictionaryQueryOptions(1).queryKey, FIXTURE);
  return render(
    <QueryClientProvider client={qc}>
      <ProjectCbsView />
    </QueryClientProvider>,
  );
}

describe("ProjectCbsView", () => {
  it("renders the page heading and both collapsible sections", () => {
    renderView();
    expect(
      screen.getByRole("heading", { name: "Project CBS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CBS Code Book/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Master CBS Dictionary/ }),
    ).toBeInTheDocument();
  });

  it("colours the L0 discipline roots red", () => {
    renderView();
    // Both sections are open by default, so "Civil" renders in each.
    const civils = screen.getAllByText("Civil");
    const row = civils[0].closest('[role="treeitem"]');
    expect(row).not.toBeNull();
    expect(row).toHaveStyle({ backgroundColor: "#C0504D" });
  });

  it("shows originals only in the Code Book and the generated rows in the Dictionary", () => {
    renderView();
    const [codeBook, dictionary] = screen.getAllByRole("tree");
    // Roots are collapsed by default; expand each root to reveal its children.
    for (const tree of [codeBook, dictionary]) {
      fireEvent.click(within(tree).getByRole("button", { name: "Expand" }));
    }
    expect(within(codeBook).queryByText("Civil Materials")).toBeNull();
    expect(within(dictionary).getByText("Civil Materials")).toBeInTheDocument();
    // Section pills carry the per-view row counts.
    expect(
      screen.getByRole("button", { name: /CBS Code Book/ }),
    ).toHaveTextContent("4 rows");
    expect(
      screen.getByRole("button", { name: /Master CBS Dictionary/ }),
    ).toHaveTextContent("5 rows");
  });

  it("filters a section by search query", async () => {
    renderView();
    const search = screen.getAllByRole("searchbox")[0]; // the Code Book section
    fireEvent.change(search, { target: { value: "Topsoil" } });
    const tree = screen.getAllByRole("tree")[0];
    expect(await within(tree).findByText("Topsoil")).toBeInTheDocument();
    // Ancestors stay so the match is reachable; unrelated rows are pruned.
    expect(within(tree).getByText("Earthwork & Trenching")).toBeInTheDocument();
    expect(within(tree).queryByText("Civil Shop Materials")).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });
});

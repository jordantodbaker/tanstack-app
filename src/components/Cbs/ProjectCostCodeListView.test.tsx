// @vitest-environment happy-dom
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
  projectCostCodesQueryOptions,
  type CbsBrowserRow,
  type CbsTreeRow,
} from "~/utils/cbs";
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

// What the server returns: ORIGINAL rows only. `fetchProjectCostCodes`
// filters out the generated S/M rows in SQL, so the page never sees them and
// does no filtering of its own — the fixture mirrors that contract.
const FIXTURE: CbsTreeRow[] = [
  item("100-00-0000-00-0", "Civil", { subReporting: true, materialCode: true }),
  item("101-00-0000-00-0", "Civil Shop Materials", { materialCode: true }),
  item("101-05-0000-00-0", "Earthwork & Trenching"),
  item("101-05-0500-00-0", "Topsoil", { uom: "CY" }),
];

// A project granted one leaf and none of its parents. The query pulls the
// ancestors in flagged `context` so the hierarchy still reads; they are not
// codes the project may use.
const CONTEXT_FIXTURE: CbsBrowserRow[] = [
  item("101-05-0500-00-0", "Topsoil", { uom: "CY" }),
  // Flagged rows carry their real workbook flags — the badges have to be
  // suppressed by the context flag, not by the row happening to have none.
  {
    ...item("100-00-0000-00-0", "Civil", {
      subReporting: true,
      materialCode: true,
    }),
    context: true,
  },
  { ...item("101-00-0000-00-0", "Civil Shop Materials"), context: true },
  { ...item("101-05-0000-00-0", "Earthwork & Trenching"), context: true },
];

function renderView(fixture: CbsBrowserRow[] = FIXTURE) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectCostCodesQueryOptions(1).queryKey, fixture);
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
    expect(screen.queryByRole("button", { name: /CBS Dictionary/ })).toBeNull();
  });

  it("renders every row the server returns, re-filtering nothing", () => {
    // The ORIGINAL filter lives in the query now. Re-adding a client-side
    // filter here would drop rows and break this count.
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    const tree = screen.getByRole("tree");
    expect(within(tree).getByText("Civil")).toBeInTheDocument();
    expect(within(tree).getByText("Earthwork & Trenching")).toBeInTheDocument();
    expect(within(tree).getByText("Topsoil")).toBeInTheDocument();
    expect(screen.getByText("4 rows")).toBeInTheDocument();
  });

  it("reads the project cost-code query, not the unfiltered dictionary", () => {
    // Seeding only `projectCostCodesQueryOptions` is the guard: if the page
    // switched back to a query that ships generated rows, its key would miss
    // the seeded data and the tree would never render.
    renderView();
    expect(screen.getByRole("tree")).toBeInTheDocument();
    expect(screen.queryByText(/Loading CBS data/)).toBeNull();
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
    expect(within(civil).getByTitle("Material Code: YES")).toHaveTextContent(
      "M",
    );

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

  /**
   * Setup lets a user tick a leaf without its parent. Before the query pulled
   * ancestors in, such a leaf rendered at the top level — "Field Staff" beside
   * the disciplines rather than under "Field Indirects".
   */
  describe("context ancestors", () => {
    const rowFor = (name: string) =>
      within(screen.getByRole("tree"))
        .getByText(name)
        .closest('[role="treeitem"]')! as HTMLElement;

    it("nests a granted leaf under its ungranted parents", () => {
      renderView(CONTEXT_FIXTURE);
      fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
      const tree = screen.getByRole("tree");
      for (const name of [
        "Civil",
        "Civil Shop Materials",
        "Earthwork & Trenching",
        "Topsoil",
      ]) {
        expect(within(tree).getByText(name)).toBeInTheDocument();
      }
      // Four rows, one branch: the leaf is deepest, not a sibling of Civil.
      expect(rowFor("Topsoil")).toHaveAttribute("aria-level", "4");
    });

    it("counts only the codes the project may actually use", () => {
      renderView(CONTEXT_FIXTURE);
      expect(screen.getByText("1 row")).toBeInTheDocument();
    });

    it("mutes a context row and drops its badges", () => {
      renderView(CONTEXT_FIXTURE);
      fireEvent.click(screen.getByRole("button", { name: "Expand all" }));

      const civil = rowFor("Civil");
      expect(civil.className).toContain("opacity-55");
      // Its workbook flags are set, but it is not an available code.
      expect(within(civil).queryByTitle(/Code: YES/)).toBeNull();

      const topsoil = rowFor("Topsoil");
      expect(topsoil.className).not.toContain("opacity-55");
    });
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

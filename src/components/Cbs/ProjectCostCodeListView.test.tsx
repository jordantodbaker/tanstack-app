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
// render every row — these tests exercise the tree logic (flatten/color/search),
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
    // The real virtualizer exposes this; a deep link calls it.
    scrollToIndex: () => {},
  }),
}));

// The "Export Excel" button is the only thing that imports this, and the
// export itself is server-side. Stub it so a test can read the payload the
// page sends — the toggle has to reach the file, not just the screen.
const { exportCall } = vi.hoisted(() => ({
  exportCall: vi.fn(async (_opts: { data: Record<string, unknown> }) => ({
    filename: "cbs-project-cost-codes.xlsx",
    base64: "",
  })),
}));
vi.mock("~/utils/cbsExport", () => ({ cbsExporterFor: () => exportCall }));

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
afterEach(() => exportCall.mockClear());

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
    laborCode: null,
    equipmentCode: null,
    otherCode: null,
    // Active unless a case overrides it — the Code Book and the project list
    // hide anything that is not.
    status: "Active",
    ...over,
  };
}

// What the server returns: ORIGINAL rows only. `fetchProjectCostCodes`
// filters out the generated S/M rows in SQL, so the page never sees them and
// does no filtering of its own — the fixture mirrors that contract.
const FIXTURE: CbsTreeRow[] = [
  item("100-00-0000-00-0", "Civil", {
    subReporting: true,
    materialCode: true,
    laborCode: true,
  }),
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
    expect(screen.queryByRole("button", { name: /Cost Accounts/ })).toBeNull();
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

  it("colors the L0 discipline roots red", () => {
    renderView();
    const row = screen.getByText("Civil").closest('[role="treeitem"]');
    expect(row).toHaveStyle({ backgroundColor: "#C0504D" });
  });

  describe("badges under a cost-type filter", () => {
    // A row carrying several cost types shows them all until a filter is on.
    // While one is, the other badges contradict the list: every row shown has
    // earned its place on the filtered flag alone, so an L beside the M reads
    // as though the row were Labor too.
    const MULTI = [
      item("601-10-0000-00-0", "Bolt-up", {
        laborCode: true,
        subReporting: true,
        materialCode: true,
      }),
    ];

    const badgesOn = (name: string) =>
      Array.from(
        within(screen.getByRole("tree"))
          .getByText(name)
          .closest('[role="treeitem"]')!
          .querySelectorAll("[title$='YES']"),
      ).map((el) => el.textContent);

    const filterBy = (label: string) =>
      fireEvent.click(screen.getByRole("button", { name: label }));

    it("shows every cost type the row carries when nothing is filtered", () => {
      renderView(MULTI);
      expect(badgesOn("Bolt-up")).toEqual(["L", "S", "M"]);
    });

    it("shows only the filtered cost type", () => {
      renderView(MULTI);
      filterBy("Materials");
      expect(badgesOn("Bolt-up")).toEqual(["M"]);
    });

    it("shows only the filtered cost type for a different one", () => {
      renderView(MULTI);
      filterBy("Subcontracts");
      expect(badgesOn("Bolt-up")).toEqual(["S"]);
    });

    it("shows both when two cost types are filtered on", () => {
      // The badges follow the filter, not a single choice.
      renderView(MULTI);
      filterBy("Subcontracts");
      filterBy("Materials");
      expect(badgesOn("Bolt-up")).toEqual(["S", "M"]);
    });

    it("keeps the workbook's column order, not the click order", () => {
      renderView(MULTI);
      filterBy("Materials");
      filterBy("Labor");
      expect(badgesOn("Bolt-up")).toEqual(["L", "M"]);
    });

    it("restores the full set when the filter is cleared", () => {
      renderView(MULTI);
      filterBy("Materials");
      expect(badgesOn("Bolt-up")).toEqual(["M"]);
      filterBy("Materials");
      expect(badgesOn("Bolt-up")).toEqual(["L", "S", "M"]);
    });

    it("does not invent a badge the row does not carry", () => {
      // Filtering on Equipment must not badge a row that has no equipment
      // code — and that row should not survive the filter at all.
      renderView(MULTI);
      filterBy("Equipment");
      // It drops out entirely rather than appearing with no badge, so there is
      // no tree left to look in.
      expect(screen.queryByText("Bolt-up")).toBeNull();
      expect(
        screen.getByText("No rows match this filter."),
      ).toBeInTheDocument();
    });
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

    it("offers a toggle that hides the ungranted parents", async () => {
      renderView(CONTEXT_FIXTURE);
      const toggle = screen.getByLabelText("Hide ungranted parents");
      expect(within(screen.getByRole("tree")).getByText("Civil")).toBeTruthy();

      fireEvent.click(toggle);
      const tree = screen.getByRole("tree");
      for (const gone of [
        "Civil",
        "Civil Shop Materials",
        "Earthwork & Trenching",
      ]) {
        expect(within(tree).queryByText(gone)).toBeNull();
      }
      // The granted code survives: hiding its parents must not strand it.
      expect(within(tree).getByText("Topsoil")).toBeInTheDocument();
      // And it climbs to the top, since nothing above it was granted.
      expect(rowFor("Topsoil")).toHaveAttribute("aria-level", "1");

      fireEvent.click(toggle);
      expect(
        within(screen.getByRole("tree")).getByText("Civil"),
      ).toBeInTheDocument();
    });

    it("does not offer the toggle when there are no ungranted parents", () => {
      // The catalog views have none; a checkbox that can do nothing is noise.
      renderView(FIXTURE);
      expect(screen.queryByLabelText("Hide ungranted parents")).toBeNull();
    });

    it("exports the rows on screen when the toggle is on", async () => {
      // The export is rebuilt server-side from the view and filter, so the
      // toggle only reaches the file if the page sends it. It did not, once.
      renderView(CONTEXT_FIXTURE);
      const exportButton = screen.getByRole("button", {
        name: /Export Excel/,
      });
      const payload = (call: number) => exportCall.mock.calls[call][0].data;

      fireEvent.click(exportButton);
      await vi.waitFor(() => expect(exportCall).toHaveBeenCalledTimes(1));
      expect(payload(0)).toMatchObject({ hideContext: false });

      fireEvent.click(screen.getByLabelText("Hide ungranted parents"));
      fireEvent.click(exportButton);
      await vi.waitFor(() => expect(exportCall).toHaveBeenCalledTimes(2));
      expect(payload(1)).toMatchObject({ hideContext: true });
    });

    it("never asks to hide parents on a view that has none", async () => {
      // Nothing to hide, so the file must not be labeled as though there was.
      renderView(FIXTURE);
      fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));
      await vi.waitFor(() => expect(exportCall).toHaveBeenCalledTimes(1));
      expect(exportCall.mock.calls[0][0].data).toMatchObject({
        hideContext: false,
      });
    });

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

  /**
   * The color legend doubles as the depth control: the key to the colors is
   * how you get to them. Levels here are CODE levels, matching the swatches.
   */
  describe("level swatches", () => {
    const names = () =>
      within(screen.getByRole("tree"))
        .getAllByRole("treeitem")
        .map((r) => r.textContent ?? "");
    const swatch = (level: number) =>
      within(screen.getByRole("group", { name: "Expand to level" })).getByRole(
        "button",
        { name: `L${level}` },
      );

    it("opens the tree to the level clicked", () => {
      renderView();
      // FIXTURE is 100 (L0) → 101 (L1) → 101-05 (L2) → 101-05-05 (L3).
      fireEvent.click(swatch(1));
      expect(names().join("|")).toContain("Civil Shop Materials");
      expect(names().join("|")).not.toContain("Earthwork");

      fireEvent.click(swatch(2));
      expect(names().join("|")).toContain("Earthwork");
      expect(names().join("|")).not.toContain("Topsoil");

      fireEvent.click(swatch(3));
      expect(names().join("|")).toContain("Topsoil");
    });

    it("collapses to the roots on L0", () => {
      renderView();
      fireEvent.click(swatch(3));
      expect(names()).toHaveLength(4);
      fireEvent.click(swatch(0));
      expect(names()).toHaveLength(1);
    });

    it("marks the level in force, and clears it once a row is toggled", () => {
      renderView();
      fireEvent.click(swatch(2));
      expect(swatch(2)).toHaveAttribute("aria-pressed", "true");
      expect(swatch(3)).toHaveAttribute("aria-pressed", "false");

      // Closing one row by hand means the tree is no longer at a single level.
      fireEvent.click(
        within(screen.getByRole("tree")).getAllByRole("button", {
          name: /Collapse|Expand/,
        })[0],
      );
      expect(swatch(2)).toHaveAttribute("aria-pressed", "false");
    });

    it("agrees with Expand all at the deepest swatch", () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
      const all = names();
      fireEvent.click(swatch(5));
      expect(names()).toEqual(all);
    });
  });

  /**
   * The Subcontracts / Materials toggles. On this page only ORIGINAL rows are
   * listed, so what they key off is each row's own Sub Code / Material Code —
   * the same flags the S and M badges show.
   */
  describe("row-type filters", () => {
    const names = () =>
      within(screen.getByRole("tree"))
        .getAllByRole("treeitem")
        .map((r) => r.textContent ?? "")
        .join("|");

    it("keeps subcontract codes and their ancestors", () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Subcontracts" }));
      // Civil is the only row in FIXTURE with Sub Code YES.
      expect(names()).toContain("Civil");
      expect(names()).not.toContain("Earthwork");
      expect(screen.getByText("1 match")).toBeInTheDocument();
    });

    it("keeps material codes", () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Materials" }));
      // Civil and Civil Shop Materials both carry Material Code YES.
      expect(names()).toContain("Civil Shop Materials");
      expect(names()).not.toContain("Topsoil");
      expect(screen.getByText("2 matches")).toBeInTheDocument();
    });

    it("shows its pressed state and toggles back off", () => {
      renderView();
      const subs = screen.getByRole("button", { name: "Subcontracts" });
      expect(subs).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(subs);
      expect(subs).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(subs);
      expect(subs).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
      expect(names()).toContain("Topsoil");
    });

    it("offers a button for every cost type, in the workbook's order", () => {
      renderView();
      const labels = [
        "Labor",
        "Subcontracts",
        "Materials",
        "Equipment",
        "Other",
      ];
      for (const l of labels) {
        expect(screen.getByRole("button", { name: l })).toBeInTheDocument();
      }
    });

    it("filters by the three new cost types too", () => {
      renderView();
      // FIXTURE's Civil row carries Labor; nothing carries Equipment.
      fireEvent.click(screen.getByRole("button", { name: "Labor" }));
      expect(names()).toContain("Civil");
      expect(screen.getByText("1 match")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Labor" }));
      fireEvent.click(screen.getByRole("button", { name: "Equipment" }));
      expect(screen.getByText(/No rows match this filter/)).toBeInTheDocument();
    });

    it("badges a row for each cost type it carries", () => {
      renderView();
      const tree = screen.getByRole("tree");
      const civil = within(tree)
        .getByText("Civil")
        .closest('[role="treeitem"]')! as HTMLElement;
      expect(within(civil).getByTitle("Labor Code: YES")).toHaveTextContent(
        "L",
      );
      expect(within(civil).getByTitle("Sub Code: YES")).toHaveTextContent("S");
      expect(within(civil).getByTitle("Material Code: YES")).toHaveTextContent(
        "M",
      );
    });

    it("narrows the search box rather than widening it", () => {
      renderView();
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "Topsoil" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Subcontracts" }));
      // Topsoil matches the text but carries no sub code.
      expect(screen.getByText(/No rows match this filter/)).toBeInTheDocument();
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

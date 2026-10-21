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
    // The real virtualizer exposes this; a deep link calls it.
    scrollToIndex: () => {},
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

import { AdminMasterCbsPage } from "./admin.master-cbs";
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
    laborCode: null,
    equipmentCode: null,
    otherCode: null,
    // Active unless a case overrides it — the Code Book and the project list
    // hide anything that is not.
    status: "Active",
    costClassification: null,
    ...over,
  };
}

const CATALOG: CbsTreeRow[] = [
  item("100-00-0000-00-0", "Civil", { subReporting: true }),
  item("100-00-0000-00-S", "Civil Subcontracts", { rowType: "SUB" }),
  item("600-00-0000-00-0", "Pipe Shop"),
  item("600-10-0000-00-0", "Hot Tap (reserved)", { status: "Inactive" }),
  item("600-20-0000-00-0", "Blank Status Account", { status: null }),
];

function seeded() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(cbsCatalogQueryOptions().queryKey, CATALOG);
  return qc;
}

function renderPage() {
  const qc = seeded();
  // The page, not the route component: the latter reads a search param and
  // would need a RouterProvider around it.
  const Page = AdminMasterCbsPage;
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
}

describe("CBS Code Book", () => {
  it("lists every cost line in Cost Accounts, as the dictionary does", () => {
    renderPage();
    // The S row hangs under its account, so open the branch before looking.
    fireEvent.click(screen.getAllByRole("button", { name: "Expand all" })[0]);
    const [accounts] = screen.getAllByRole("tree");
    expect(within(accounts).getByText("Civil")).toBeInTheDocument();
    expect(within(accounts).getByText("Civil Subcontracts")).toBeInTheDocument();
  });

  it("still lists every cost type in the dictionary section", () => {
    renderPage();
    // The S row hangs under its account, so open the branch before looking.
    const expandAll = screen.getAllByRole("button", { name: "Expand all" });
    fireEvent.click(expandAll[expandAll.length - 1]);
    const trees = screen.getAllByRole("tree");
    const dictionary = trees[trees.length - 1];
    expect(
      within(dictionary).getByText("Civil Subcontracts"),
    ).toBeInTheDocument();
  });

  it("renders the whole catalog with no project selected", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "CBS Code Book" }),
    ).toBeInTheDocument();
    // Both disciplines are listed even though no project is selected.
    expect(screen.getAllByText("Civil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pipe Shop").length).toBeGreaterThan(0);
  });

  it("differs from the full dictionary only by status", () => {
    renderPage();
    // Cost Accounts: everything but the Inactive row — the generated "-S" twin
    // and the blank-Status account included. The Dictionary has all five.
    expect(
      screen.getByRole("button", { name: /^Cost Accounts/ }),
    ).toHaveTextContent("4 rows");
    expect(
      screen.getByRole("button", { name: /^CBS Dictionary/ }),
    ).toHaveTextContent("5 rows");
  });

  it("badges a generated row by its row type in both sections", () => {
    renderPage();
    for (const btn of screen.getAllByRole("button", { name: "Expand all" })) {
      fireEvent.click(btn);
    }
    for (const tree of screen.getAllByRole("tree")) {
      const sub = within(tree)
        .getByText("Civil Subcontracts")
        .closest('[role="treeitem"]')! as HTMLElement;
      expect(within(sub).getByTitle("Generated sub-code row")).toHaveTextContent(
        "S",
      );
      // The account row is an original: no flag badges any more.
      const civil = within(tree)
        .getByText("Civil")
        .closest('[role="treeitem"]')! as HTMLElement;
      expect(within(civil).queryByTitle(/Code: YES/)).toBeNull();
    }
  });

  it("offers no Status filter on the Cost Accounts list", () => {
    // That list is active-only by construction, so a status filter there is a
    // question with one answer. The Dictionary below it has both, so it keeps
    // the row.
    renderPage();
    const rows = screen.getAllByRole("group", { name: "Filter by status" });
    expect(rows).toHaveLength(1);
    // The one that remains belongs to the Dictionary — the second section.
    const costTypeRows = screen.getAllByRole("group", {
      name: "Filter by cost type",
    });
    expect(costTypeRows).toHaveLength(2);
    expect(
      costTypeRows[1].compareDocumentPosition(rows[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("always offers Active, Inactive and Retired on the Dictionary", () => {
    // Even when the catalog holds one status — as the live CBS does — the
    // filter must not vanish, and no button is disabled.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(cbsCatalogQueryOptions().queryKey, [
      item("100-00-0000-00-0", "Civil"),
      item("100-10-0000-00-0", "Civil Site Work", { status: null }),
    ]);
    render(
      <QueryClientProvider client={qc}>
        <AdminMasterCbsPage />
      </QueryClientProvider>,
    );
    const group = screen.getByRole("group", { name: "Filter by status" });
    for (const label of ["Active", "Inactive", "Retired"]) {
      expect(within(group).getByRole("button", { name: label })).toBeEnabled();
    }
    // A status nothing carries filters to an empty result, not an error.
    fireEvent.click(within(group).getByRole("button", { name: "Retired" }));
    expect(screen.getByText("No rows match this filter.")).toBeInTheDocument();
  });

  it("keeps each name's cost-type marker in both sections", () => {
    // Names are stored as the workbook writes them, "(*)" / "(S)" and all.
    // Both sections list every cost line, and the marker is what tells an
    // account's lines apart.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(cbsCatalogQueryOptions().queryKey, [
      item("100-00-0000-00-0", "Civil (*)", { subReporting: true }),
      item("100-00-0000-00-S", "Civil (S)", { rowType: "SUB" }),
    ]);
    render(
      <QueryClientProvider client={qc}>
        <AdminMasterCbsPage />
      </QueryClientProvider>,
    );
    for (const btn of screen.getAllByRole("button", { name: "Expand all" })) {
      fireEvent.click(btn);
    }
    const [accounts, dictionary] = screen.getAllByRole("tree");
    expect(within(accounts).getByText("Civil (*)")).toBeInTheDocument();
    expect(within(accounts).getByText("Civil (S)")).toBeInTheDocument();
    expect(within(dictionary).getByText("Civil (*)")).toBeInTheDocument();
    expect(within(dictionary).getByText("Civil (S)")).toBeInTheDocument();
  });

  it("keeps retired accounts out of the Cost Accounts list", () => {
    renderPage();
    // Both rows hang under "Pipe Shop", so open the branch before looking.
    const expandAll = screen.getAllByRole("button", { name: "Expand all" });
    fireEvent.click(expandAll[0]);
    const [accounts] = screen.getAllByRole("tree");
    expect(within(accounts).queryByText("Hot Tap (reserved)")).toBeNull();
    // A blank Status is a gap in the workbook, not a retirement.
    expect(
      within(accounts).getByText("Blank Status Account"),
    ).toBeInTheDocument();
  });

  it("still lists retired accounts in the dictionary section", () => {
    // The Dictionary is the one view that shows everything, so a retired code
    // stays findable — someone reading an old estimate has to be able to look
    // it up.
    renderPage();
    for (const btn of screen.getAllByRole("button", { name: "Expand all" })) {
      fireEvent.click(btn);
    }
    const trees = screen.getAllByRole("tree");
    const dictionary = trees[trees.length - 1];
    expect(
      within(dictionary).getByText("Hot Tap (reserved)"),
    ).toBeInTheDocument();
  });

  it("opens a deep-linked code and selects it", () => {
    // ?code= has to reveal the row AND fill the detail panel, or the link
    // lands you on a collapsed tree with nothing to show for it.
    render(
      <QueryClientProvider client={seeded()}>
        <AdminMasterCbsPage focusCode="600-20-0000-00-0" />
      </QueryClientProvider>,
    );
    // Hidden behind its collapsed parent until the link expands the path.
    const [accounts] = screen.getAllByRole("tree");
    expect(within(accounts).getByText("Blank Status Account")).toBeTruthy();
  });

  it("ignores a code that is not in the catalog", () => {
    render(
      <QueryClientProvider client={seeded()}>
        <AdminMasterCbsPage focusCode="999-99-9999-99-9" />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "CBS Code Book" }),
    ).toBeInTheDocument();
  });

  it("says the catalog is unfiltered, not project-scoped", () => {
    renderPage();
    expect(
      screen.getAllByText(/no project allow-list applied/).length,
    ).toBeGreaterThan(0);
  });
});

/**
 * A cost-type filter reads a row's own cost type on both lists.
 *
 * CBS.xlsx ships pre-expanded: an account's S and M rows are separate rows
 * that all carry the account's flag columns. So on a list of cost lines the
 * flags cannot be read — the account's "-S" row would answer YES to "is this
 * a Material code?" because the ACCOUNT has one, just not on that line.
 */
describe("cost-type filter across the two lists", () => {
  const FLAGGED = { subReporting: true, materialCode: true };
  const MIXED: CbsTreeRow[] = [
    item("700-00-0000-00-0", "Welding", FLAGGED),
    item("700-00-0000-00-S", "Welding Subcontracts", FLAGGED),
    item("700-00-0000-00-M", "Welding Materials", FLAGGED),
  ];

  function renderWith(rows: CbsTreeRow[]) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(cbsCatalogQueryOptions().queryKey, rows);
    return render(
      <QueryClientProvider client={qc}>
        <AdminMasterCbsPage />
      </QueryClientProvider>,
    );
  }

  /** Both sections carry the same controls; the Dictionary is the second. */
  const filterDictionaryBy = (label: string) =>
    fireEvent.click(screen.getAllByRole("button", { name: label })[1]);
  const filterAccountsBy = (label: string) =>
    fireEvent.click(screen.getAllByRole("button", { name: label })[0]);
  const dictionaryTree = () => screen.getAllByRole("tree")[1];

  it("shows only M codes in the Dictionary under a Materials filter", () => {
    renderWith(MIXED);
    filterDictionaryBy("Materials");
    const tree = dictionaryTree();
    expect(within(tree).getByText("Welding Materials")).toBeInTheDocument();
    // The one that used to leak through on its account's material flag.
    expect(within(tree).queryByText("Welding Subcontracts")).toBeNull();
    // And the roll-up, whose own cost type is 0.
    expect(within(tree).queryByText("Welding")).toBeNull();
  });

  it("shows only S codes under a Subcontracts filter", () => {
    renderWith(MIXED);
    filterDictionaryBy("Subcontracts");
    const tree = dictionaryTree();
    expect(within(tree).getByText("Welding Subcontracts")).toBeInTheDocument();
    expect(within(tree).queryByText("Welding Materials")).toBeNull();
  });

  it("reads a row's own cost type on the Cost Accounts list too", () => {
    // It lists cost lines like the Dictionary, so the account's flags must not
    // keep its "-S" line — or its "-0" roll-up — under a Materials filter.
    renderWith(MIXED);
    filterAccountsBy("Materials");
    const tree = screen.getAllByRole("tree")[0];
    expect(within(tree).getByText("Welding Materials")).toBeInTheDocument();
    expect(within(tree).queryByText("Welding Subcontracts")).toBeNull();
    expect(within(tree).queryByText("Welding")).toBeNull();
  });

  it("filters the two lists independently", () => {
    renderWith(MIXED);
    filterDictionaryBy("Materials");
    // Cost Accounts was not touched, so its account row stays put.
    expect(
      within(screen.getAllByRole("tree")[0]).getByText("Welding"),
    ).toBeInTheDocument();
  });
});

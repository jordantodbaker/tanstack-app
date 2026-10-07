// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom has no layout, so the real virtualizer would render 0 rows. Stub it to
// render every row — these tests exercise selection/search/expand logic, not
// the windowing itself.
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

// Fix the selected project so our seeded query keys (projectId 1) line up.
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: 1,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

// The project picker fetches the project list; it's not what's under test.
vi.mock("~/components/ProjectSelect", () => ({
  ProjectSelect: () => null,
}));

// Keep the query options real (they build the cache keys) but stub the save.
vi.mock("~/utils/setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/setup")>()),
  updateAllowedFefCbsItems: vi.fn().mockResolvedValue({ ok: true }),
}));

import { Route } from "./setup";
import {
  allowedFefCbsItemIdsQueryOptions,
  updateAllowedFefCbsItems,
} from "~/utils/setup";
import {
  cbsCatalogQueryOptions,
  cbsItemDetailQueryOptions,
  type CbsItemDetail,
  type CbsTreeRow,
} from "~/utils/cbs";
import { parseCbsDisplayCode, type CbsTreeItem } from "~/lib/cbs-tree";

type SetupItem = CbsTreeRow;

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(updateAllowedFefCbsItems).mockClear();
});

let nextId = 1;
function item(displayCode: string, name: string, rowType: CbsTreeItem["rowType"] = "ORIGINAL"): SetupItem {
  return {
    id: nextId++,
    ...parseCbsDisplayCode(displayCode),
    displayCode,
    name,
    uom: "LS",
    accountDescription: name,
    rowType,
    subReporting: null,
    materialCode: null,
  };
}

// Civil root → Civil Shop Materials → Earthwork → Topsoil (M leaf), plus an
// unrelated Piping root so search has something to prune.
const civil = item("100-00-0000-00-0", "Civil");
const shop = item("101-00-0000-00-0", "Civil Shop Materials");
const earthwork = item("101-05-0000-00-0", "Earthwork & Trenching");
const topsoil = item("101-05-0500-00-M", "Topsoil", "MATERIAL");
const piping = item("600-00-0000-00-0", "Piping");
const CATALOG = [civil, shop, earthwork, topsoil, piping];

/** The full column set the detail panel fetches for one row. */
function detail(row: CbsTreeRow, over: Partial<CbsItemDetail> = {}): CbsItemDetail {
  return {
    id: row.id,
    displayCode: row.displayCode,
    costCode: row.displayCode.replace(/-/g, ""),
    name: row.name,
    uom: row.uom,
    rowType: row.rowType,
    generatedFrom: null,
    subReporting: null,
    materialCode: null,
    materialType: null,
    costCenter: null,
    costClassification: null,
    status: "Active",
    accountDescription: row.name,
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

function renderSetup(allowedIds: number[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(cbsCatalogQueryOptions().queryKey, CATALOG);
  qc.setQueryData(allowedFefCbsItemIdsQueryOptions(1).queryKey, allowedIds);
  for (const row of CATALOG) {
    qc.setQueryData(
      cbsItemDetailQueryOptions(row.id).queryKey,
      detail(row, { costCenter: "2010", description: `About ${row.name}.` }),
    );
  }
  const SetupPage = Route.options.component!;
  return render(
    <QueryClientProvider client={qc}>
      <SetupPage />
    </QueryClientProvider>,
  );
}

const checkbox = (label: string) =>
  screen.getByRole("checkbox", { name: `Toggle ${label}` });

describe("Setup page", () => {
  it("shows a parent as indeterminate when only some descendants are allowed", () => {
    renderSetup([topsoil.id]);
    expect(checkbox("Civil")).toHaveAttribute("aria-checked", "mixed");
    expect(checkbox("Piping")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("checking a parent allows every unselected descendant and saves the delta", async () => {
    renderSetup([topsoil.id]);
    fireEvent.click(checkbox("Civil"));

    expect(checkbox("Civil")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("4 selected")).toBeInTheDocument();
    await waitFor(() =>
      expect(updateAllowedFefCbsItems).toHaveBeenCalledWith({
        data: {
          projectId: 1,
          addIds: [civil.id, shop.id, earthwork.id],
          removeIds: [],
        },
      }),
    );
  });

  it("unchecking a fully-selected parent removes its whole subtree", async () => {
    renderSetup([civil.id, shop.id, earthwork.id, topsoil.id]);
    fireEvent.click(checkbox("Civil"));

    expect(checkbox("Civil")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    await waitFor(() =>
      expect(updateAllowedFefCbsItems).toHaveBeenCalledWith({
        data: {
          projectId: 1,
          addIds: [],
          removeIds: [civil.id, shop.id, earthwork.id, topsoil.id],
        },
      }),
    );
  });

  it("starts collapsed and reveals children with Expand all", () => {
    renderSetup([]);
    const tree = screen.getByRole("tree");
    expect(within(tree).queryByText("Topsoil")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(tree).getByText("Topsoil")).toBeInTheDocument();
    // Generated rows carry their S/M marker.
    expect(within(tree).getByTitle("Generated material row")).toHaveTextContent("M");

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(within(tree).queryByText("Topsoil")).toBeNull();
  });

  it("search keeps only matching paths and opens them", async () => {
    renderSetup([]);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "topsoil" },
    });
    const tree = screen.getByRole("tree");
    expect(await within(tree).findByText("Topsoil")).toBeInTheDocument();
    expect(within(tree).getByText("Earthwork & Trenching")).toBeInTheDocument();
    expect(within(tree).queryByText("Piping")).toBeNull();
  });

  it("shows a placeholder until a row is selected", () => {
    renderSetup([]);
    expect(
      screen.getByText(/Select a row to see its full CBS detail/),
    ).toBeInTheDocument();
  });

  it("shows the clicked row's detail, and swaps it when another is clicked", () => {
    renderSetup([]);
    fireEvent.click(screen.getByText("Civil"));
    expect(screen.getByText("About Civil.")).toBeInTheDocument();
    expect(screen.getByText("2010")).toBeInTheDocument();
    // The header repeats the code; the list carries the cost code.
    expect(screen.getByText("100000000000")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Piping"));
    expect(screen.getByText("About Piping.")).toBeInTheDocument();
    expect(screen.queryByText("About Civil.")).toBeNull();
  });

  it("closes the detail back to the placeholder", () => {
    renderSetup([]);
    fireEvent.click(screen.getByText("Civil"));
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByText("About Civil.")).toBeNull();
    expect(
      screen.getByText(/Select a row to see its full CBS detail/),
    ).toBeInTheDocument();
  });

  it("selecting a row does not toggle its checkbox", () => {
    // The row is clickable for selection AND carries a checkbox; the two must
    // not fire together, or browsing the tree would silently edit the
    // allow-list.
    renderSetup([]);
    fireEvent.click(screen.getByText("Civil"));
    expect(checkbox("Civil")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(updateAllowedFefCbsItems).not.toHaveBeenCalled();
  });

  it("ticking the checkbox does not select the row", () => {
    renderSetup([]);
    fireEvent.click(checkbox("Civil"));
    expect(screen.getByText("4 selected")).toBeInTheDocument();
    expect(
      screen.getByText(/Select a row to see its full CBS detail/),
    ).toBeInTheDocument();
  });
});

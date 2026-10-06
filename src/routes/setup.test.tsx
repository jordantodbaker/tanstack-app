// @vitest-environment jsdom
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
  fetchSetupCbsItems,
  setupCbsItemsQueryOptions,
  updateAllowedFefCbsItems,
} from "~/utils/setup";
import { parseCbsDisplayCode, type CbsTreeItem } from "~/lib/cbs-tree";

type SetupItem = Awaited<ReturnType<typeof fetchSetupCbsItems>>[number];

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
    l2Description: null,
    rowType,
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

function renderSetup(allowedIds: number[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(setupCbsItemsQueryOptions().queryKey, CATALOG);
  qc.setQueryData(allowedFefCbsItemIdsQueryOptions(1).queryKey, allowedIds);
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
});

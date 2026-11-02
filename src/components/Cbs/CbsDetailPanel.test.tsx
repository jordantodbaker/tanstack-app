// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cbsItemDetailQueryOptions, type CbsItemDetail } from "~/utils/cbs";
import type { CbsTreeNode } from "~/lib/cbs-tree";
import { CbsDetailPanel, cbsCodeLink } from "./CbsDetailPanel";

/**
 * The detail panel's "Copy link": the `?code=` deep link for the selected
 * row, pointed at whichever page the panel sits on, and left out on a page
 * that does not read `?code=`.
 */

const node: CbsTreeNode = {
  pathKey: "052-15-0500-00-L",
  depth: 2,
  level: 3,
  item: {
    id: 7,
    l1: "052",
    l2: "15",
    l3: "05",
    l4: "00",
    l5: "00",
    l6: "L",
    displayCode: "052-15-0500-00-L",
    name: "Superintendents - Civil (L)",
    accountDescription: "",
    uom: "HR",
  },
  children: [],
  descendantItemIds: [7],
  searchHaystack: "",
};

function renderPanel(linkPath?: string | null) {
  const client = new QueryClient();
  // The body fetches the row's full column set; seed it so nothing goes to
  // the network, and so the header renders without a pending state. Only the
  // columns the header reads are needed, so the rest is left off.
  client.setQueryData(cbsItemDetailQueryOptions(node.item.id).queryKey, {
    id: 7,
    displayCode: node.item.displayCode,
    name: node.item.name,
    uom: "HR",
  } as CbsItemDetail);
  return render(
    <QueryClientProvider client={client}>
      <CbsDetailPanel selected={node} linkPath={linkPath} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cbsCodeLink", () => {
  it("is the page's ?code= deep link, absolute, with the code escaped", () => {
    expect(cbsCodeLink("/project-cost-codes", "052-15-0500-00-L")).toBe(
      `${window.location.origin}/project-cost-codes?code=052-15-0500-00-L`,
    );
    expect(cbsCodeLink("/admin/master-cbs", "A&B")).toMatch(
      /\/admin\/master-cbs\?code=A%26B$/,
    );
  });
});

describe("CbsDetailPanel copy link", () => {
  it("copies the selected row's link for the page it is on, and says so", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderPanel("/project-cost-codes");

    const button = screen.getByRole("button", {
      name: "Copy link to this code",
    });
    expect(button).toHaveTextContent("Copy link");
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledWith(
      cbsCodeLink("/project-cost-codes", "052-15-0500-00-L"),
    );
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("says when the clipboard refused, rather than looking copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("no"))) },
      configurable: true,
    });
    renderPanel("/admin/master-cbs");
    fireEvent.click(
      screen.getByRole("button", { name: "Copy link to this code" }),
    );
    expect(await screen.findByText("Couldn't copy")).toBeTruthy();
  });

  it("is left out on a page that does not read ?code=", () => {
    renderPanel(null);
    expect(
      screen.queryByRole("button", { name: "Copy link to this code" }),
    ).toBeNull();
    // The panel itself still renders.
    expect(screen.getByRole("button", { name: "Close details" })).toBeTruthy();
  });
});

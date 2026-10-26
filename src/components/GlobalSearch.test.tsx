// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The header search. A button opens it on every screen size — on a phone
 * there is no keyboard shortcut, so the button is the only way in — and
 * ⌘K / Ctrl-K / "/" open it from the keyboard. Results come from the query
 * cache here; nothing reaches the server.
 */
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: 1,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

import { GlobalSearch } from "./GlobalSearch";
import { searchQueryOptions, type SearchResult } from "~/utils/search";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.clearAllMocks());

const PUMP: SearchResult = {
  entity: "cvr",
  id: 5,
  number: "CVR-005",
  title: "Add booster pump",
  status: "REQUESTED",
  discipline: "piping",
  route: "/changelog",
  filterQuery: "CVR-005",
};

function renderSearch() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(searchQueryOptions(1, "pump").queryKey, [PUMP]);
  return render(
    <QueryClientProvider client={qc}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
}

const box = () => screen.queryByPlaceholderText(/Search CVRs, FCOs/);

describe("GlobalSearch", () => {
  it("opens from the header button", () => {
    renderSearch();
    expect(box()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(box()).toBeInTheDocument();
  });

  it.each([
    ["Ctrl-K", { key: "k", ctrlKey: true }],
    ["⌘K", { key: "k", metaKey: true }],
    ["/", { key: "/" }],
  ])("opens with %s", (_label, init) => {
    renderSearch();
    fireEvent.keyDown(window, init);
    expect(box()).toBeInTheDocument();
  });

  it("ignores '/' while typing in a field", () => {
    renderSearch();
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "/" });
    expect(box()).toBeNull();
    field.remove();
  });

  it("asks for two characters before searching", () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(box()!, { target: { value: "p" } });
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
  });

  it("lists matches and goes to the record's page, filtered to it", async () => {
    vi.useFakeTimers();
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(box()!, { target: { value: "pump" } });
    // The term is debounced before it is searched.
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.click(screen.getByRole("button", { name: /Add booster pump/ }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/changelog",
      search: { q: "CVR-005" },
    });
    // And it closes, cleared for next time.
    expect(box()).toBeNull();
  });
});

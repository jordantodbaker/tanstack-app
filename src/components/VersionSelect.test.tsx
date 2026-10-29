// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EstimateVersionOption } from "~/utils/versions";

/**
 * The version picker's dialogs — new, rename, refresh, freeze/release and
 * delete. Each one calls its server function with the right arguments,
 * closes on success, and shows the server's error when it fails.
 */
const h = vi.hoisted(() => ({
  versions: [] as EstimateVersionOption[],
  versionId: 1 as number | null,
  isAdmin: true,
  setVersionId: vi.fn(),
  createVersion: vi.fn(),
  updateVersion: vi.fn(),
  deleteVersion: vi.fn(),
  freezeVersionRates: vi.fn(),
  unfreezeVersionRates: vi.fn(),
  applyVersionRateRefresh: vi.fn(),
  fetchRefreshPlan: vi.fn(),
}));

vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({ projectId: 5 }),
}));
vi.mock("~/lib/selected-version", () => ({
  useSelectedVersion: () => ({
    versionId: h.versionId,
    setVersionId: h.setVersionId,
  }),
}));
vi.mock("~/lib/use-current-user", () => ({
  useIsAdmin: () => h.isAdmin,
}));
vi.mock("~/utils/versions", () => ({
  versionsQueryOptions: (projectId: number) => ({
    queryKey: ["versions", projectId],
    queryFn: () => h.versions,
  }),
  createVersion: h.createVersion,
  updateVersion: h.updateVersion,
  deleteVersion: h.deleteVersion,
}));
vi.mock("~/utils/rateFreeze", () => ({
  freezeVersionRates: h.freezeVersionRates,
  unfreezeVersionRates: h.unfreezeVersionRates,
  invalidateRateFreezeQueries: vi.fn(),
}));
vi.mock("~/utils/rateRefresh", () => ({
  versionRateRefreshQueryOptions: (versionId: number) => ({
    queryKey: ["rate-refresh", versionId],
    queryFn: h.fetchRefreshPlan,
  }),
  applyVersionRateRefresh: h.applyVersionRateRefresh,
  invalidateRateRefreshQueries: vi.fn(),
}));

import { VersionSelect } from "./VersionSelect";

const version = (over: Partial<EstimateVersionOption>): EstimateVersionOption => ({
  id: 1,
  versionNumber: 1,
  name: "",
  description: "",
  parentVersionId: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  ratesFrozenAt: null,
  ...over,
});

async function renderPicker() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <VersionSelect />
    </QueryClientProvider>,
  );
  // The dialogs act on the selected version, which needs the list loaded.
  await screen.findByRole("option", { name: /^v1/ });
}

/** Opens the kebab menu, then the named item's dialog. */
async function openAction(item: string) {
  fireEvent.click(await screen.findByTitle("Version actions"));
  fireEvent.click(await screen.findByText(item));
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  h.versions = [
    version({ id: 1, versionNumber: 1, name: "as-bid" }),
    version({ id: 2, versionNumber: 2 }),
  ];
  h.versionId = 1;
  h.isAdmin = true;
});
afterEach(cleanup);

describe("New version", () => {
  it("creates a copy of the current version and switches to it", async () => {
    h.createVersion.mockResolvedValue({ id: 9 });
    await renderPicker();
    fireEvent.click(await screen.findByTitle("New version"));
    fireEvent.change(screen.getByPlaceholderText("as-bid"), {
      target: { value: "  rev A  " },
    });
    fireEvent.click(button("Create version"));
    await waitFor(() => expect(h.setVersionId).toHaveBeenCalledWith(9));
    expect(h.createVersion).toHaveBeenCalledWith({
      data: { projectId: 5, name: "rev A", sourceVersionId: 1 },
    });
    expect(screen.queryByText("New estimate version")).toBeNull();
  });

  it("starts blank when the copy box is cleared", async () => {
    h.createVersion.mockResolvedValue({ id: 9 });
    await renderPicker();
    fireEvent.click(await screen.findByTitle("New version"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button("Create version"));
    await waitFor(() => expect(h.createVersion).toHaveBeenCalled());
    expect(h.createVersion).toHaveBeenCalledWith({
      data: { projectId: 5, name: undefined, sourceVersionId: undefined },
    });
  });
});

describe("Rename", () => {
  it("saves the name and description, then closes", async () => {
    h.updateVersion.mockResolvedValue({});
    await renderPicker();
    await openAction("Rename…");
    expect(screen.getByText("Rename v1")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("as-bid"), {
      target: { value: "as-sold" },
    });
    fireEvent.click(button("Save"));
    await waitFor(() => expect(screen.queryByText("Rename v1")).toBeNull());
    expect(h.updateVersion).toHaveBeenCalledWith({
      data: { versionId: 1, name: "as-sold", description: "" },
    });
  });

  it("keeps the dialog open with the server's message on failure", async () => {
    h.updateVersion.mockRejectedValue(new Error("Name already used."));
    await renderPicker();
    await openAction("Rename…");
    fireEvent.click(button("Save"));
    expect(await screen.findByText("Name already used.")).toBeTruthy();
    expect(screen.getByText("Rename v1")).toBeTruthy();
  });
});

describe("Freeze / release rates", () => {
  it("freezes a live version", async () => {
    h.freezeVersionRates.mockResolvedValue({});
    await renderPicker();
    await openAction("Freeze rates…");
    expect(screen.getByText("Freeze rates on v1?")).toBeTruthy();
    fireEvent.click(button("Freeze rates"));
    await waitFor(() =>
      expect(h.freezeVersionRates).toHaveBeenCalledWith({
        data: { versionId: 1 },
      }),
    );
    expect(h.unfreezeVersionRates).not.toHaveBeenCalled();
  });

  it("lets an admin release a frozen version", async () => {
    h.versions = [version({ id: 1, ratesFrozenAt: "2026-10-01T00:00:00.000Z" })];
    h.unfreezeVersionRates.mockResolvedValue({});
    await renderPicker();
    await openAction("Release rates…");
    fireEvent.click(button("Release rates"));
    await waitFor(() =>
      expect(h.unfreezeVersionRates).toHaveBeenCalledWith({
        data: { versionId: 1 },
      }),
    );
  });

  it("offers a non-admin no release", async () => {
    h.isAdmin = false;
    h.versions = [version({ id: 1, ratesFrozenAt: "2026-10-01T00:00:00.000Z" })];
    await renderPicker();
    fireEvent.click(await screen.findByTitle("Version actions"));
    expect(screen.queryByText("Release rates…")).toBeNull();
  });
});

describe("Refresh rates", () => {
  it("applies a plan that has rows to change", async () => {
    h.fetchRefreshPlan.mockResolvedValue({
      rowCount: 2,
      totalDelta: 150,
      changes: [
        {
          label: "Pipefitter",
          storedRate: "90",
          newRate: "95",
          rowIds: [1, 2],
          laborCostDelta: 150,
        },
      ],
    });
    h.applyVersionRateRefresh.mockResolvedValue({});
    await renderPicker();
    await openAction("Refresh rates…");
    fireEvent.click(await screen.findByRole("button", { name: "Update 2 rows" }));
    await waitFor(() =>
      expect(h.applyVersionRateRefresh).toHaveBeenCalledWith({
        data: { versionId: 1 },
      }),
    );
  });

  it("has nothing to apply when every row already matches", async () => {
    h.fetchRefreshPlan.mockResolvedValue({ rowCount: 0, totalDelta: 0, changes: [] });
    await renderPicker();
    await openAction("Refresh rates…");
    expect(
      await screen.findByText(/already matches the current rates/),
    ).toBeTruthy();
    expect(button("Update").disabled).toBe(true);
  });
});

describe("Delete", () => {
  it("deletes the version and clears the selection", async () => {
    h.deleteVersion.mockResolvedValue({});
    await renderPicker();
    await openAction("Delete…");
    fireEvent.click(button("Delete version"));
    await waitFor(() => expect(h.setVersionId).toHaveBeenCalledWith(null));
    expect(h.deleteVersion).toHaveBeenCalledWith({ data: { versionId: 1 } });
  });

  it("can't delete a project's only version", async () => {
    h.versions = [version({ id: 1 })];
    await renderPicker();
    fireEvent.click(await screen.findByTitle("Version actions"));
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /Delete/ }).disabled,
    ).toBe(true);
  });

  it("is admin-only", async () => {
    h.isAdmin = false;
    await renderPicker();
    fireEvent.click(await screen.findByTitle("Version actions"));
    expect(screen.queryByText("Delete…")).toBeNull();
  });
});

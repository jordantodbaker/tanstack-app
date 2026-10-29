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
import type {
  EstimateSnapshotDetail,
  EstimateSnapshotItem,
} from "~/utils/snapshots";

/**
 * The Summary page's Snapshots panel: create and edit dialogs send the
 * trimmed label and notes, and a row opens the frozen-totals detail.
 */
const h = vi.hoisted(() => ({
  snapshots: [] as EstimateSnapshotItem[],
  detail: null as EstimateSnapshotDetail | null,
  createSnapshot: vi.fn(),
  updateSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
}));

vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({ projectId: 5 }),
}));
vi.mock("~/lib/selected-version", () => ({
  useSelectedVersion: () => ({ versionId: 11 }),
}));
vi.mock("~/lib/use-current-user", () => ({
  useCurrentUser: () => ({ data: { email: "pm@example.com" } }),
  useIsAdmin: () => false,
}));
vi.mock("~/utils/snapshots", () => ({
  snapshotsQueryOptions: (projectId: number) => ({
    queryKey: ["snapshots", projectId],
    queryFn: () => h.snapshots,
  }),
  snapshotDetailQueryOptions: (id: number | null) => ({
    queryKey: ["snapshot", id],
    queryFn: () => h.detail,
  }),
  createSnapshot: h.createSnapshot,
  updateSnapshot: h.updateSnapshot,
  deleteSnapshot: h.deleteSnapshot,
}));
vi.mock("~/utils/projectTotals", () => ({
  projectFefRowTotalsQueryOptions: (versionId: number | null) => ({
    queryKey: ["totals", versionId],
    queryFn: () => null,
  }),
}));

import { SnapshotsSection } from "./SnapshotsSection";

const EMPTY_TOTALS = {
  laborByDigit: {},
  materialsByDigit: {},
  laborHoursByDigit: {},
  invalidByDiscipline: {},
  craftSupportLabor: 0,
} as unknown as EstimateSnapshotDetail["totals"];

async function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SnapshotsSection />
    </QueryClientProvider>,
  );
  await screen.findByText(h.snapshots.length ? h.snapshots[0].label : /No snapshots yet/);
}

const button = (name: string) =>
  screen.getByRole<HTMLButtonElement>("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  h.snapshots = [
    {
      id: 3,
      label: "As-bid",
      notes: "First issue",
      rowCount: 42,
      createdByEmail: "pm@example.com",
      createdAt: "2026-10-01T15:00:00.000Z",
    },
  ];
  h.detail = {
    id: 3,
    projectId: 5,
    versionId: 11,
    label: "As-bid",
    notes: "First issue",
    rowCount: 42,
    basisInputs: null,
    totals: EMPTY_TOTALS,
    createdByEmail: "pm@example.com",
    createdAt: "2026-10-01T15:00:00.000Z",
  } as EstimateSnapshotDetail;
});
afterEach(cleanup);

describe("Create snapshot", () => {
  it("needs a label, then sends it trimmed with the selected version", async () => {
    h.createSnapshot.mockResolvedValue({});
    await renderPanel();
    fireEvent.click(button("Create snapshot"));
    expect(button("Create").disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("As-bid"), {
      target: { value: "  Rev 2  " },
    });
    fireEvent.change(screen.getByPlaceholderText(/Submitted to owner/), {
      target: { value: " after RFI-042 " },
    });
    fireEvent.click(button("Create"));
    await waitFor(() =>
      expect(h.createSnapshot).toHaveBeenCalledWith({
        data: { projectId: 5, versionId: 11, label: "Rev 2", notes: "after RFI-042" },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Create" })).toBeNull(),
    );
  });

  it("shows the server's error and stays open", async () => {
    h.createSnapshot.mockRejectedValue(new Error("Version is empty."));
    await renderPanel();
    fireEvent.click(button("Create snapshot"));
    fireEvent.change(screen.getByPlaceholderText("As-bid"), {
      target: { value: "Rev 2" },
    });
    fireEvent.click(button("Create"));
    expect(await screen.findByText("Version is empty.")).toBeTruthy();
  });
});

describe("Edit snapshot", () => {
  it("starts from the snapshot and saves the trimmed edit", async () => {
    h.updateSnapshot.mockResolvedValue({});
    await renderPanel();
    fireEvent.click(screen.getByTitle("Edit label & notes"));
    const label = screen.getByDisplayValue("As-bid");
    fireEvent.change(label, { target: { value: " As-sold " } });
    fireEvent.click(button("Save"));
    await waitFor(() =>
      expect(h.updateSnapshot).toHaveBeenCalledWith({
        data: { id: 3, label: "As-sold", notes: "First issue" },
      }),
    );
  });

  it("does not open the detail behind it", async () => {
    await renderPanel();
    fireEvent.click(screen.getByTitle("Edit label & notes"));
    expect(screen.getByText("Edit snapshot")).toBeTruthy();
    expect(screen.queryByText(/Headline — snapshot vs\. current/)).toBeNull();
  });
});

describe("Snapshot detail", () => {
  it("opens from the row with the frozen totals", async () => {
    await renderPanel();
    fireEvent.click(screen.getByText("As-bid"));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/Headline — snapshot vs\. current/),
    ).toBeTruthy();
    expect(within(dialog).getByText(/42 rows/)).toBeTruthy();
  });
});

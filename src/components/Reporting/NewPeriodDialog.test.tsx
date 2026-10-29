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

const h = vi.hoisted(() => ({
  snapshots: [] as { id: number; label: string; createdAt: string }[],
  createReportingPeriod: vi.fn(),
}));

vi.mock("~/utils/reporting", () => ({
  createReportingPeriod: h.createReportingPeriod,
}));
vi.mock("~/utils/snapshots", () => ({
  snapshotsQueryOptions: (projectId: number) => ({
    queryKey: ["snapshots", projectId],
    queryFn: () => h.snapshots,
  }),
}));

import { NewPeriodDialog } from "./NewPeriodDialog";

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NewPeriodDialog projectId={5} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "New Period" }));
}

const createButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Create" });

beforeEach(() => {
  vi.clearAllMocks();
  h.snapshots = [
    { id: 8, label: "Rev 2", createdAt: "2026-10-20T00:00:00.000Z" },
    { id: 3, label: "As-bid", createdAt: "2026-09-01T00:00:00.000Z" },
  ];
});
afterEach(cleanup);

describe("NewPeriodDialog", () => {
  it("creates a period against the newest snapshot by default", async () => {
    h.createReportingPeriod.mockResolvedValue({});
    renderDialog();
    await screen.findByRole("option", { name: /Rev 2/ });
    fireEvent.change(screen.getByPlaceholderText("April 2026"), {
      target: { value: " October 2026 " },
    });
    fireEvent.change(screen.getByLabelText("Data date"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(h.createReportingPeriod).toHaveBeenCalledWith({
        data: {
          projectId: 5,
          label: "October 2026",
          dataDate: new Date(2026, 9, 31).toISOString(),
          baselineSnapshotId: 8,
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("New Reporting Period")).toBeNull(),
    );
  });

  it("needs a label", async () => {
    renderDialog();
    await screen.findByRole("option", { name: /Rev 2/ });
    expect(createButton().disabled).toBe(true);
  });

  it("can't create without a snapshot to baseline against", async () => {
    h.snapshots = [];
    renderDialog();
    expect(
      await screen.findByText(/No snapshots on this project yet/),
    ).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("April 2026"), {
      target: { value: "October 2026" },
    });
    expect(createButton().disabled).toBe(true);
  });

  it("shows the server's error and stays open", async () => {
    h.createReportingPeriod.mockRejectedValue(
      new Error("Baseline snapshot does not belong to this project."),
    );
    renderDialog();
    await screen.findByRole("option", { name: /Rev 2/ });
    fireEvent.change(screen.getByPlaceholderText("April 2026"), {
      target: { value: "October 2026" },
    });
    fireEvent.click(createButton());
    expect(
      await screen.findByText(
        "Baseline snapshot does not belong to this project.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("New Reporting Period")).toBeTruthy();
  });
});

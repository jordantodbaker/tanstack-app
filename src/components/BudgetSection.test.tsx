// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Fix the selected project so the component renders without localStorage
// hydration, and so our seeded query keys (projectId 1) line up.
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: 1,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

import { BudgetSection } from "./BudgetSection";
import { budgetReconciliationQueryOptions } from "~/utils/reporting";
import { snapshotsQueryOptions } from "~/utils/snapshots";
import {
  projectFefRowTotalsQueryOptions,
  type ProjectFefRowTotals,
} from "~/utils/projectTotals";

afterEach(cleanup);

const row = (over: Record<string, number>) => ({
  bucket: "",
  asBid: 0,
  approvedChange: 0,
  currentBudget: 0,
  pendingChange: 0,
  weightedTrend: 0,
  afc: 0,
  ...over,
});

// "611" and "613" both roll up to the "piping" discipline (disciplines-data),
// so both L1 rows nest under the single Piping discipline row when expanded.
const FIXTURE = {
  baselineSnapshotId: null,
  baselineLabel: "As-bid",
  byDiscipline: [
    {
      ...row({ asBid: 1000, approvedChange: 200, currentBudget: 1200, pendingChange: 50, afc: 1200 }),
      bucket: "piping",
      disciplineLabel: "Piping",
    },
  ],
  byL1: [
    {
      ...row({ asBid: 600, approvedChange: 100, currentBudget: 700, afc: 700 }),
      bucket: "611",
      name: "High Alloy SS 321 & 347",
    },
    {
      ...row({ asBid: 400, approvedChange: 100, currentBudget: 500, pendingChange: 50, afc: 500 }),
      bucket: "613",
      name: null, // not in the CBS catalog → fallback label
    },
  ],
  total: row({ asBid: 1000, approvedChange: 200, currentBudget: 1200, pendingChange: 50, afc: 1200 }),
};

function renderSection() {
  // staleTime Infinity + retry false → useQuery serves the seeded cache and
  // never invokes the real server-fn queryFn.
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
  qc.setQueryData(budgetReconciliationQueryOptions(1, null).queryKey, FIXTURE);
  qc.setQueryData(snapshotsQueryOptions(1).queryKey, []);
  // Live totals only feed the "working estimate vs as-bid" note, which is
  // hidden here (baselineSnapshotId is null) — the empty maps the component
  // reads are all that matter, so cast a minimal object to the full type.
  qc.setQueryData(
    projectFefRowTotalsQueryOptions(1).queryKey,
    { laborByL1: {}, materialsByL1: {} } as unknown as ProjectFefRowTotals,
  );
  render(
    <QueryClientProvider client={qc}>
      <BudgetSection />
    </QueryClientProvider>,
  );
}

describe("BudgetSection", () => {
  it("renders the discipline row and the waterfall columns", () => {
    renderSection();
    expect(screen.getByText("Piping")).toBeInTheDocument();
    // "Pending" also appears in the explanatory blurb, so target the header.
    expect(
      screen.getByRole("columnheader", { name: "Pending" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "= Current Budget" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "= AFC" }),
    ).toBeInTheDocument();
  });

  it("keeps L1 children collapsed until the discipline is expanded", () => {
    renderSection();
    expect(screen.queryByText(/^611 —/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Piping"));
    expect(
      screen.getByText("611 — High Alloy SS 321 & 347"),
    ).toBeInTheDocument();
  });

  it("labels an L1 with no CBS match as 'not in CBS catalog'", () => {
    renderSection();
    fireEvent.click(screen.getByText("Piping"));
    expect(screen.getByText("613 — not in CBS catalog")).toBeInTheDocument();
  });
});

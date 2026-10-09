// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The sidebar is now per app: the Field Estimate Form gets the discipline
 * take-off tree, every other app gets its own flat list of pages, and the
 * launcher gets nothing. Before the split, the discipline tree rendered on
 * every page in the product.
 *
 * Links are stubbed to plain anchors — this exercises which nav is chosen and
 * what it contains, not routing.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children?: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}));

vi.mock("~/components/ProjectSelect", () => ({
  ProjectSelect: () => <div data-testid="project-select" />,
}));
vi.mock("~/components/VersionSelect", () => ({
  VersionSelect: () => <div data-testid="version-select" />,
}));

let isAdmin = true;
vi.mock("~/lib/use-current-user", () => ({
  useIsAdmin: () => isAdmin,
}));
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({ projectId: 1, setProjectId: vi.fn() }),
}));
vi.mock("~/lib/selected-version", () => ({
  useSelectedVersion: () => ({ versionId: 7, setVersionId: vi.fn() }),
}));

// The allow-list query decides which disciplines are offered; seed it wide so
// the tree renders rather than collapsing to Setup only.
vi.mock("~/utils/setup", () => ({
  allowedCbsL1CodesQueryOptions: () => ({
    queryKey: ["allowed-l1"],
    queryFn: async () => ALLOWED_L1,
  }),
}));
vi.mock("~/utils/projectTotals", () => ({
  invalidByDisciplineQueryOptions: () => ({
    queryKey: ["invalid-by-discipline"],
    queryFn: async () => ({ civil: 3 }),
  }),
}));
vi.mock("~/utils/userPreferences", () => ({
  userRecentsQueryOptions: () => ({
    queryKey: ["recents"],
    queryFn: async () => RECENTS,
  }),
}));

/** Two recents on the selected project, so the section actually renders. */
const RECENTS = [
  {
    entityType: "FieldChangeOrder",
    entityId: 11,
    projectId: 1,
    number: "098",
    title: "Relocate pipe rack",
    viewedAt: "2026-10-09T00:00:00.000Z",
  },
  {
    entityType: "Rfi",
    entityId: 12,
    projectId: 1,
    number: "044",
    title: "Weld spec clarification",
    viewedAt: "2026-10-08T00:00:00.000Z",
  },
];

import { Sidebar } from "./Sidebar";
import { appById } from "~/config/apps";
import { disciplinesData } from "~/config/disciplines-data";

const ALLOWED_L1 = disciplinesData.flatMap((d) => d.l1Codes ?? []);

afterEach(() => {
  cleanup();
  isAdmin = true;
});

function renderSidebar(app: Parameters<typeof Sidebar>[0]["app"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["allowed-l1"], ALLOWED_L1);
  qc.setQueryData(["invalid-by-discipline"], { civil: 3 });
  qc.setQueryData(["recents"], RECENTS);
  return render(
    <QueryClientProvider client={qc}>
      <Sidebar app={app} />
    </QueryClientProvider>,
  );
}

const nav = (label: string) =>
  screen.getByRole("complementary", { name: `${label} navigation` });

describe("Sidebar", () => {
  it("shows the discipline tree in the Field Estimate Form", () => {
    renderSidebar(appById.estimate);
    const aside = nav("Field Estimate Form");
    expect(within(aside).getByText("Civil")).toBeInTheDocument();
    expect(within(aside).getByText("Piping")).toBeInTheDocument();
    expect(within(aside).getByText("Setup")).toBeInTheDocument();
  });

  it("keeps the discipline tree out of every other app", () => {
    // This is the whole point of the split — the Change Log has no disciplines.
    renderSidebar(appById.changes);
    const aside = nav("Change Log");
    expect(within(aside).queryByText("Civil")).toBeNull();
    expect(within(aside).queryByText("Piping")).toBeNull();
    expect(within(aside).getByText("FCO Log")).toBeInTheDocument();
    expect(within(aside).getByText("Trends")).toBeInTheDocument();
  });

  it("renders nothing on the launcher and the help guide", () => {
    const { container } = renderSidebar(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("flags a discipline whose take-off has invalid rows", () => {
    renderSidebar(appById.estimate);
    expect(
      within(nav("Field Estimate Form")).getByLabelText(
        "3 invalid Take Off rows",
      ),
    ).toBeInTheDocument();
  });

  it("groups Administration's pages under their headings", () => {
    renderSidebar(appById.admin);
    const aside = nav("Administration");
    for (const heading of [
      "Project data",
      "Rates & resources",
      "Templates",
      "Platform",
    ]) {
      expect(within(aside).getByText(heading)).toBeInTheDocument();
    }
    // CBS and CVR Templates moved to the apps they belong to.
    expect(within(aside).queryByText("CBS")).toBeNull();
    expect(within(aside).queryByText("CVR Templates")).toBeNull();
  });

  it("hides admin-only pages from a non-admin", () => {
    isAdmin = false;
    renderSidebar(appById.cbs);
    const aside = nav("Cost Breakdown Structure");
    expect(
      within(aside).getByText("Project Cost Code List"),
    ).toBeInTheDocument();
    expect(within(aside).queryByText("CBS Code Book")).toBeNull();
  });

  it("hides Setup from a non-admin in the estimate", () => {
    isAdmin = false;
    renderSidebar(appById.estimate);
    const aside = nav("Field Estimate Form");
    expect(within(aside).queryByText("Setup")).toBeNull();
    expect(within(aside).getByText("Civil")).toBeInTheDocument();
  });

  it("offers the version picker only where versions apply", () => {
    renderSidebar(appById.estimate);
    expect(screen.getByTestId("version-select")).toBeInTheDocument();
    cleanup();
    renderSidebar(appById.changes);
    expect(screen.queryByTestId("version-select")).toBeNull();
    // The project picker is on every app's drawer.
    expect(screen.getByTestId("project-select")).toBeInTheDocument();
  });

  it("shows Recently viewed only in the app whose records it tracks", () => {
    renderSidebar(appById.changes);
    expect(screen.getByText("Recently viewed")).toBeInTheDocument();
    expect(screen.getByText("Relocate pipe rack")).toBeInTheDocument();

    cleanup();
    renderSidebar(appById.estimate);
    expect(screen.queryByText("Recently viewed")).toBeNull();
    cleanup();
    renderSidebar(appById.reports);
    expect(screen.queryByText("Recently viewed")).toBeNull();
  });

  it("keeps Recently viewed inside the scrolling nav, under the links", () => {
    // It used to be a sibling of the `flex-1` nav, which stretched to the full
    // column height and left a screen-height gap above it. Being INSIDE the
    // nav is what keeps it beneath the links instead of on the viewport floor.
    renderSidebar(appById.changes);
    const navEl = within(nav("Change Log")).getByRole("navigation");
    const recents = within(navEl).getByText("Recently viewed");
    expect(navEl).toContainElement(recents);

    // And it follows the links rather than preceding them.
    const all = [...navEl.querySelectorAll("*")];
    expect(all.indexOf(recents)).toBeGreaterThan(
      all.indexOf(within(navEl).getByText("Trends")),
    );
  });
});

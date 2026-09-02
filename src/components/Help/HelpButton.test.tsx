// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CurrentUser, UserRole } from "~/utils/users";

// The dialog links to the `/help` route; a bare <a> keeps the test out of
// router context without changing what is being asserted.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const currentUser = vi.hoisted(() => ({
  data: undefined as { data: CurrentUser | undefined } | undefined,
}));

vi.mock("~/lib/use-current-user", () => ({
  useCurrentUser: () => currentUser.data ?? { data: undefined },
}));

import { HelpButton } from "./HelpButton";

const signedInAs = (role: UserRole) => {
  currentUser.data = {
    data: { id: 1, clerkId: "u_1", email: "a@b.com", role },
  };
};

afterEach(() => {
  cleanup();
  currentUser.data = undefined;
});

// `HelpButton` loads the dialog with `React.lazy`. Transforming that module
// graph on first use costs more than a `findBy*` default timeout allows, so
// warm it once here rather than making every test wait on it.
beforeAll(async () => {
  await import("./HelpDialog");
});

/** Opens the guide and waits for the lazily-loaded dialog to mount. */
const openGuide = async () => {
  render(<HelpButton />);
  fireEvent.click(screen.getByRole("button", { name: /help/i }));
  await screen.findByText("Help & user guide");
};

/**
 * Section titles appear twice — once in the contents rail, once as the body
 * heading — so assertions go through the heading role rather than raw text.
 */
const heading = (name: string) => screen.queryByRole("heading", { name });

describe("HelpButton", () => {
  it("renders a labelled trigger and opens the guide on click", async () => {
    signedInAs("USER");
    render(<HelpButton />);

    expect(screen.queryByText("Help & user guide")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /help/i }));
    expect(await screen.findByText("Help & user guide")).toBeInTheDocument();
  });

  it("shows a plain user the shared guide but no admin chapter", async () => {
    signedInAs("USER");
    await openGuide();

    expect(heading("Getting started")).toBeInTheDocument();
    expect(heading("Take Off")).toBeInTheDocument();
    expect(heading("Administration")).not.toBeInTheDocument();
    expect(heading("Setup (administrators)")).not.toBeInTheDocument();
    expect(heading("Reviewing and approving")).not.toBeInTheDocument();
  });

  it("shows an approver the review chapter", async () => {
    signedInAs("APPROVER");
    await openGuide();

    expect(heading("Reviewing and approving")).toBeInTheDocument();
    expect(heading("Administration")).not.toBeInTheDocument();
  });

  it("shows an administrator everything", async () => {
    signedInAs("ADMINISTRATOR");
    await openGuide();

    expect(heading("Administration")).toBeInTheDocument();
    expect(heading("Setup (administrators)")).toBeInTheDocument();
    expect(heading("Reviewing and approving")).toBeInTheDocument();
  });

  it("withholds gated content while the user query is still loading", async () => {
    // `data` undefined — mid-flight. Least privilege until proven otherwise.
    await openGuide();
    expect(heading("Administration")).not.toBeInTheDocument();
  });

  it("renders workflow actions filtered to the reader's role", async () => {
    signedInAs("USER");
    await openGuide();
    expect(screen.getByText("Submit for review")).toBeInTheDocument();
    expect(screen.queryByText("Advance to approval")).not.toBeInTheDocument();
    expect(screen.queryByText("Send back")).not.toBeInTheDocument();

    cleanup();
    signedInAs("APPROVER");
    await openGuide();
    expect(screen.getByText("Advance to approval")).toBeInTheDocument();
    expect(screen.getAllByText("Send back").length).toBeGreaterThan(0);
  });

  it("footnotes the actions an originator may not perform", async () => {
    signedInAs("APPROVER");
    await openGuide();
    expect(
      screen.getAllByText(/Not available on a record you raised yourself/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("filters the guide as you type", async () => {
    signedInAs("USER");
    await openGuide();

    fireEvent.change(screen.getAllByLabelText("Search the guide")[0], {
      target: { value: "fill handle" },
    });

    expect(heading("Spreadsheet-style range editing")).toBeInTheDocument();
    expect(heading("Dashboard")).not.toBeInTheDocument();
  });

  it("tells the reader when a search matches nothing", async () => {
    signedInAs("USER");
    await openGuide();

    fireEvent.change(screen.getAllByLabelText("Search the guide")[0], {
      target: { value: "zzzznotathing" },
    });
    expect(
      screen.getByText("Nothing in the guide matches that search."),
    ).toBeInTheDocument();
  });
});

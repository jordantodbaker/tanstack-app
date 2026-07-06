// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  SaveIndicator,
  combineSaveStatus,
  type SaveStatus,
} from "./SaveIndicator";

afterEach(cleanup);

describe("combineSaveStatus", () => {
  it("is idle when empty or all idle", () => {
    expect(combineSaveStatus([])).toBe("idle");
    expect(combineSaveStatus(["idle", "idle"])).toBe("idle");
  });

  it("surfaces a recent success over idle", () => {
    expect(combineSaveStatus(["idle", "saved"])).toBe("saved");
  });

  it("prefers unsaved edits over a prior success", () => {
    expect(combineSaveStatus(["saved", "pending"])).toBe("pending");
  });

  it("prefers an in-flight save over pending", () => {
    expect(combineSaveStatus(["pending", "saving"])).toBe("saving");
  });

  it("lets an error win over everything", () => {
    const all: SaveStatus[] = ["idle", "pending", "saving", "saved", "error"];
    expect(combineSaveStatus(all)).toBe("error");
  });
});

describe("SaveIndicator", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<SaveIndicator status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an unsaved-changes hint while pending", () => {
    render(<SaveIndicator status="pending" />);
    expect(screen.getByText("Unsaved changes…")).toBeInTheDocument();
  });

  it("shows a saving hint while in flight", () => {
    render(<SaveIndicator status="saving" />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("shows a failure message on error", () => {
    render(<SaveIndicator status="error" />);
    expect(screen.getByText(/Save failed/)).toBeInTheDocument();
  });

  it("shows a saved confirmation, with a time when provided", () => {
    const { rerender } = render(<SaveIndicator status="saved" />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    // With a timestamp the label carries the time (locale-formatted).
    rerender(<SaveIndicator status="saved" lastSavedAt={1_700_000_000_000} />);
    expect(screen.getByText(/^Saved .+/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BulkActionBar } from "./BulkActionBar";

afterEach(cleanup);

const ACTIONS = [
  { action: "Approve", to: "APPROVED", ids: [1, 2, 3], destructive: false },
  { action: "Void", to: "VOID", ids: [4], destructive: true },
];

function setup(
  props: Partial<React.ComponentProps<typeof BulkActionBar>> = {},
) {
  const onRunAction = vi.fn();
  const onDelete = vi.fn();
  const onClear = vi.fn();
  render(
    <BulkActionBar
      count={2}
      actions={ACTIONS}
      onRunAction={onRunAction}
      onDelete={onDelete}
      onClear={onClear}
      busy={false}
      result={null}
      {...props}
    />,
  );
  return { onRunAction, onDelete, onClear };
}

describe("BulkActionBar", () => {
  it("renders nothing when no rows are selected", () => {
    const { container } = render(
      <BulkActionBar
        count={0}
        actions={ACTIONS}
        onRunAction={vi.fn()}
        onClear={vi.fn()}
        busy={false}
        result={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected count and one button per action, labelled with its id count", () => {
    setup();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve (3)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Void (1)" })).toBeInTheDocument();
  });

  it("passes the action name, ids, and destructive flag through onRunAction", () => {
    const { onRunAction } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Void (1)" }));
    expect(onRunAction).toHaveBeenCalledWith("Void", [4], true);
  });

  it("hides the delete button when no deleteIds are supplied", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("hides the delete button when onDelete is omitted, even with deleteIds", () => {
    render(
      <BulkActionBar
        count={2}
        actions={ACTIONS}
        onRunAction={vi.fn()}
        deleteIds={[7, 8]}
        onClear={vi.fn()}
        busy={false}
        result={null}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a delete button gated on deleteIds and forwards them on click", () => {
    const { onDelete } = setup({ deleteIds: [7, 8] });
    const btn = screen.getByRole("button", { name: "Delete (2)" });
    fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledWith([7, 8]);
  });

  it("does not render a delete button for an empty deleteIds list", () => {
    setup({ deleteIds: [], onDelete: vi.fn() });
    expect(
      screen.queryByRole("button", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("disables every button while busy", () => {
    setup({ busy: true });
    for (const btn of screen.getAllByRole("button")) {
      expect(btn).toBeDisabled();
    }
  });

  it("renders the result message and fires onClear", () => {
    const { onClear } = setup({ result: "Approved 3 of 3" });
    expect(screen.getByText("Approved 3 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

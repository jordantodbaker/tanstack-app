// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MutationDialog } from "./MutationDialog";

afterEach(cleanup);

type Props = Partial<React.ComponentProps<typeof MutationDialog>>;

/** Open-state lives with the caller, as it does on the real pages. */
function Harness(props: Props) {
  const [open, setOpen] = React.useState(props.open ?? false);
  return (
    <MutationDialog
      trigger={<button type="button">Open</button>}
      title="Rename v3"
      description="Shown next to the version number."
      onConfirm={() => {}}
      pending={false}
      error={null}
      errorFallback="Could not rename version."
      confirmLabel="Save"
      {...props}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

describe("MutationDialog", () => {
  it("opens from its trigger with the title, description and fields", () => {
    render(
      <Harness>
        <label>
          Name <input />
        </label>
      </Harness>,
    );
    expect(screen.queryByText("Rename v3")).toBeNull();
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Rename v3")).toBeTruthy();
    expect(screen.getByText("Shown next to the version number.")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("runs the mutation from the confirm button", () => {
    const onConfirm = vi.fn();
    render(<Harness open onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and shows the busy label while pending", () => {
    render(<Harness open pending pendingLabel="Renaming…" />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Renaming…" })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Cancel" }).disabled,
    ).toBe(true);
  });

  it("honors confirmDisabled", () => {
    render(<Harness open confirmDisabled />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled,
    ).toBe(true);
  });

  it("shows the error's own message, or the fallback", () => {
    const { unmount } = render(
      <Harness open error={new Error("Name taken.")} />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Name taken.");
    unmount();

    render(<Harness open error={{ status: 500 }} />);
    expect(screen.getByRole("alert").textContent).toBe(
      "Could not rename version.",
    );
  });

  it("shows no error line without an error", () => {
    render(<Harness open />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes from Cancel", () => {
    render(<Harness open />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Rename v3")).toBeNull();
  });
});

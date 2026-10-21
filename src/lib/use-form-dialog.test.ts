// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useFormDialog } from "./use-form-dialog";

/**
 * The shared create-or-edit form state. Nine admin dialogs use its own
 * `open` flag; the five record dialogs leave that to `EntityDialogShell`.
 * Both uses are pinned here.
 */

afterEach(cleanup);

const confirmSpy = vi.fn((_message?: string) => true);
vi.stubGlobal("confirm", confirmSpy);
beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockReturnValue(true);
});

type Item = { id?: number; name: string };
type Form = { name: string; note: string };

function setup(initial?: Item) {
  const onSubmit = vi.fn(async (_f: Form) => undefined);
  const onDelete = vi.fn(async (_id: number) => undefined);
  const hook = renderHook(
    ({ initial }: { initial?: Item }) =>
      useFormDialog<Item, Form>({
        initial,
        blank: () => ({ name: "", note: "" }),
        fromItem: (i) => ({ name: i.name, note: "from item" }),
        onSubmit,
        onDelete,
        deleteConfirm: (i) => `Delete ${i.name}?`,
      }),
    { initialProps: { initial } },
  );
  return { ...hook, onSubmit, onDelete };
}

describe("useFormDialog", () => {
  it("seeds from the item in edit mode and from blank otherwise", () => {
    expect(setup({ id: 1, name: "Pump" }).result.current.form).toEqual({
      name: "Pump",
      note: "from item",
    });
    expect(setup().result.current.form).toEqual({ name: "", note: "" });
  });

  it("updates one field at a time", () => {
    const { result } = setup();
    act(() => result.current.update("name", "Valve"));
    expect(result.current.form).toEqual({ name: "Valve", note: "" });
  });

  it("submits the current form, then closes", async () => {
    const { result, onSubmit } = setup({ id: 1, name: "Pump" });
    act(() => result.current.setOpen(true));
    act(() => result.current.update("name", "Pump 2"));
    await act(() => result.current.handleSubmit());
    expect(onSubmit).toHaveBeenCalledWith({ name: "Pump 2", note: "from item" });
    expect(result.current.open).toBe(false);
    expect(result.current.busy).toBe(false);
  });

  it("keeps a failed submit's error, stays open and releases busy", async () => {
    // Caught here rather than escaping the click handler unseen.
    const { result, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(new Error("nope"));
    act(() => result.current.setOpen(true));
    act(() => result.current.update("name", "draft"));
    await act(() => result.current.handleSubmit());
    expect(result.current.error).toBe("nope");
    expect(result.current.open).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.form.name).toBe("draft");
  });

  it("clears the error when the next attempt succeeds", async () => {
    const { result, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(new Error("nope"));
    await act(() => result.current.handleSubmit());
    expect(result.current.error).toBe("nope");
    await act(() => result.current.handleSubmit());
    expect(result.current.error).toBeNull();
  });

  it("keeps a failed delete's error", async () => {
    const { result, onDelete } = setup({ id: 7, name: "Pump" });
    onDelete.mockRejectedValueOnce(new Error("in use"));
    act(() => result.current.setOpen(true));
    await act(() => result.current.handleDelete());
    expect(result.current.error).toBe("in use");
    expect(result.current.open).toBe(true);
  });

  it("forgets the last error when it re-opens", async () => {
    const { result, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(new Error("nope"));
    act(() => result.current.setOpen(true));
    await act(() => result.current.handleSubmit());
    act(() => result.current.setOpen(false));
    act(() => result.current.setOpen(true));
    expect(result.current.error).toBeNull();
  });

  it("confirms with the item, deletes by id, then closes", async () => {
    const { result, onDelete } = setup({ id: 7, name: "Pump" });
    act(() => result.current.setOpen(true));
    await act(() => result.current.handleDelete());
    expect(confirmSpy).toHaveBeenCalledWith("Delete Pump?");
    expect(onDelete).toHaveBeenCalledWith(7);
    expect(result.current.open).toBe(false);
  });

  it("does nothing when the delete is declined", async () => {
    const { result, onDelete } = setup({ id: 7, name: "Pump" });
    confirmSpy.mockReturnValue(false);
    await act(() => result.current.handleDelete());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does nothing on delete in create mode", async () => {
    const { result, onDelete } = setup();
    await act(() => result.current.handleDelete());
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("re-seeds each time it opens, dropping abandoned edits", () => {
    // Edit X, close without saving, open again: the edits are gone.
    const { result } = setup({ id: 1, name: "Pump" });
    act(() => result.current.setOpen(true));
    act(() => result.current.update("name", "abandoned"));
    act(() => result.current.setOpen(false));
    act(() => result.current.setOpen(true));
    expect(result.current.form.name).toBe("Pump");
  });

  it("re-seeds from a new item while open", () => {
    const { result, rerender } = setup({ id: 1, name: "Pump" });
    act(() => result.current.setOpen(true));
    rerender({ initial: { id: 2, name: "Valve" } });
    expect(result.current.form.name).toBe("Valve");
  });
});

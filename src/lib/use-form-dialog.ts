import * as React from "react";

/**
 * Shared state machine for create-or-edit dialogs. Holds the dialog's open
 * flag, a draft form, and a `busy` flag for the in-flight save/delete, and
 * exposes typed `update`, `handleSubmit`, and `handleDelete` callbacks.
 *
 * The draft is re-seeded from `initial` (or `blank()`) every time the dialog
 * opens, so opening "Edit X" then closing and clicking "New X" gives a fresh
 * form rather than the previously-edited values.
 *
 * `blank` and `fromItem` are called inside an effect, so passing inline
 * arrows (closures over local state) is fine — only `[open, initial]` re-run
 * the seeding.
 */
export function useFormDialog<
  Item extends { id?: number },
  Form,
>({
  initial,
  blank,
  fromItem,
  onSubmit,
  onDelete,
  deleteConfirm,
}: {
  /** When provided, the dialog opens in edit mode with this item's data. */
  initial?: Item;
  blank: () => Form;
  fromItem: (item: Item) => Form;
  onSubmit: (form: Form) => Promise<unknown>;
  /** Omit to render no delete button. */
  onDelete?: (id: number) => Promise<unknown>;
  /** Returns the message for the delete confirm. No confirm if omitted. */
  deleteConfirm?: (item: Item) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Form>(() =>
    initial ? fromItem(initial) : blank(),
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(initial ? fromItem(initial) : blank());
    }
    // `blank` / `fromItem` deliberately omitted — they're called here but
    // their identity (inline closures) shouldn't trigger a re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const update = React.useCallback(
    <K extends keyof Form>(key: K, value: Form[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const handleSubmit = React.useCallback(async () => {
    setBusy(true);
    try {
      await onSubmit(form);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, [form, onSubmit]);

  const handleDelete = React.useCallback(async () => {
    if (!initial?.id || !onDelete) return;
    if (deleteConfirm && !confirm(deleteConfirm(initial))) return;
    setBusy(true);
    try {
      await onDelete(initial.id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, [initial, onDelete, deleteConfirm]);

  return {
    open,
    setOpen,
    form,
    setForm,
    busy,
    setBusy,
    update,
    handleSubmit,
    handleDelete,
  };
}

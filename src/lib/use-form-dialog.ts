import * as React from "react";
import { logger } from "~/lib/logger";

type EntityFormOptions<Item extends { id?: number }, Form> = {
  /** When provided, the form opens in edit mode with this item's data. */
  initial?: Item;
  blank: () => Form;
  fromItem: (item: Item) => Form;
  onSubmit: (form: Form) => Promise<unknown>;
  /** Omit to render no delete button. */
  onDelete?: (id: number) => Promise<unknown>;
  /** Returns the message for the delete confirm. No confirm if omitted. */
  deleteConfirm?: (item: Item) => string;
};

/** What a failed save or delete says, for the dialog to show. */
function failureMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "Something went wrong. Please try again.";
}

/**
 * The form state behind every create-or-edit dialog: a draft seeded from
 * `initial` (or `blank()`), a `busy` flag for the in-flight save/delete, and
 * typed `update`, `handleSubmit` and `handleDelete` callbacks.
 *
 * A save or delete that fails is caught here: logged, kept as `error` for the
 * dialog to show, and the dialog stays open with the draft intact. `onDone`
 * runs only after one succeeds — the caller closes its dialog there.
 *
 * Seeds once, on mount. A dialog that stays mounted across opens wants
 * `useFormDialog`, which re-seeds each time it opens.
 */
export function useEntityForm<Item extends { id?: number }, Form>({
  initial,
  blank,
  fromItem,
  onSubmit,
  onDelete,
  deleteConfirm,
  onDone,
}: EntityFormOptions<Item, Form> & {
  /** Called after a successful save or delete. */
  onDone?: () => void;
}) {
  const [form, setForm] = React.useState<Form>(() =>
    initial ? fromItem(initial) : blank(),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const update = React.useCallback(
    <K extends keyof Form>(key: K, value: Form[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const run = React.useCallback(
    async (what: "save" | "delete", action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        onDone?.();
      } catch (err) {
        logger.error(`form dialog ${what} failed`, { err });
        setError(failureMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const handleSubmit = React.useCallback(
    () => run("save", () => onSubmit(form)),
    [run, form, onSubmit],
  );

  const handleDelete = React.useCallback(async () => {
    if (!initial?.id || !onDelete) return;
    if (deleteConfirm && !confirm(deleteConfirm(initial))) return;
    const id = initial.id;
    await run("delete", () => onDelete(id));
  }, [run, initial, onDelete, deleteConfirm]);

  return {
    form,
    setForm,
    busy,
    setBusy,
    error,
    setError,
    update,
    handleSubmit,
    handleDelete,
  };
}

/**
 * `useEntityForm` for a dialog that owns its own open flag — the admin
 * dialogs. The draft is re-seeded from `initial` (or `blank()`) every time
 * the dialog opens, so opening "Edit X" then closing and clicking "New X"
 * gives a fresh form rather than the previously-edited values. A successful
 * save or delete closes it.
 *
 * `blank` and `fromItem` are called inside an effect, so passing inline
 * arrows (closures over local state) is fine — only `[open, initial]` re-run
 * the seeding.
 */
export function useFormDialog<Item extends { id?: number }, Form>(
  options: EntityFormOptions<Item, Form>,
) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const entity = useEntityForm({ ...options, onDone: close });
  const { setForm, setError } = entity;
  const { initial, blank, fromItem } = options;

  React.useEffect(() => {
    if (open) {
      setForm(initial ? fromItem(initial) : blank());
      setError(null);
    }
    // `blank` / `fromItem` deliberately omitted — they're called here but
    // their identity (inline closures) shouldn't trigger a re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  return { open, setOpen, ...entity };
}

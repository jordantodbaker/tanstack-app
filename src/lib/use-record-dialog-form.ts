import { useEntityForm } from "~/lib/use-form-dialog";
import { useRecordRecentView } from "~/lib/use-record-recent-view";
import type { RecentEntityType } from "~/config/recent-entities";

/**
 * The form behind a change-record dialog body (CVR, FCO, RFI, Trend, PCO):
 * `useEntityForm`, closing the dialog after a successful save or delete, and
 * logging the record to the user's "Recently viewed" when one is opened.
 *
 * Seeds once, on mount, which is right here: `EntityDialogShell` mounts the
 * body only once the dialog is open and the full record has loaded, and
 * remounts it per record.
 */
export function useRecordDialogForm<
  Item extends { id: number; projectId: number },
  Form,
>({
  closeDialog,
  recent,
  ...options
}: {
  initial?: Item;
  blank: () => Form;
  fromItem: (item: Item) => Form;
  onSubmit: (form: Form) => Promise<unknown>;
  /** Omit to render no delete button. */
  onDelete?: (id: number) => Promise<unknown>;
  /** Returns the message for the delete confirm. */
  deleteConfirm: (item: Item) => string;
  /** From `EntityDialogShell` — called after a successful save or delete. */
  closeDialog: () => void;
  /** How the record reads in "Recently viewed". */
  recent: (item: Item) => {
    entityType: RecentEntityType;
    number: string;
    title: string;
  };
}) {
  const { initial } = options;
  useRecordRecentView(
    initial
      ? {
          entityId: initial.id,
          projectId: initial.projectId,
          ...recent(initial),
        }
      : null,
  );
  return useEntityForm({ ...options, onDone: closeDialog });
}

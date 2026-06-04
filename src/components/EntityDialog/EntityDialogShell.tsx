import React from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";

// Per-entity `queryOptions(id)` helpers return typed-query-key objects whose
// literal queryKey tuples differ between entities. The shell only cares
// about useQuery's three top-level fields; type the input loosely and cast
// at the useQuery boundary rather than fight TanStack's narrowing generics.
type EntityQueryOptions<TFull> = UseQueryOptions<
  TFull | null,
  Error,
  TFull | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/**
 * Outer chrome for every entity dialog (ChangelogDialog, FcoDialog, RfiDialog,
 * TrendDialog, PcoDialog). Each one previously inlined ~30 LOC of identical
 * boilerplate: `useState(open)`, a `useQuery` to lazy-fetch the full record
 * when the dialog opens, a "Loading…" placeholder while the fetch is in
 * flight, and the `<Dialog><DialogContent>…</DialogContent></Dialog>` wrapping.
 * Pulling it here means a future tweak (e.g. animation, focus management,
 * close-on-route-change) changes one file instead of five.
 *
 * The `children` render-prop receives the loaded full record (or `undefined`
 * in create mode) and a `closeDialog` callback that the body wires into its
 * save/delete handlers.
 */
export function EntityDialogShell<TSlim extends { id?: number }, TFull>({
  trigger,
  initial,
  fullQueryOptions,
  loadingLabel,
  contentClassName = "w-[calc(100vw-2rem)] sm:max-w-[min(95vw,1100px)] max-h-[90vh] overflow-y-auto",
  children,
}: {
  /** What the user clicks to open the dialog — usually a `<Button>` or `<tr>`. */
  trigger: React.ReactNode;
  /** Slim list item when editing; undefined when creating. */
  initial?: TSlim;
  /** Returns query options for the full-record fetch. Receives the slim id
   *  (or null in create mode); the hook only enables it when the dialog is
   *  open and we're in edit mode. */
  fullQueryOptions: (id: number | null) => EntityQueryOptions<TFull>;
  /** "Loading FCO…" — shown while the full record streams in. */
  loadingLabel: string;
  /** Override when an entity needs a non-default DialogContent width. */
  contentClassName?: string;
  /** Render the body. `full` is the loaded record (undefined in create mode);
   *  `closeDialog` should be called on successful save / delete. */
  children: (
    full: TFull | undefined,
    closeDialog: () => void,
  ) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const isEdit = initial?.id !== undefined;
  const { data: full } = useQuery({
    ...fullQueryOptions(isEdit ? (initial?.id ?? null) : null),
    enabled: open && isEdit,
  });
  const fullReady = !isEdit || full !== undefined;
  const closeDialog = React.useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={contentClassName}>
        {!open ? null : !fullReady ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {loadingLabel}
          </div>
        ) : (
          <React.Fragment key={initial?.id ?? "new"}>
            {children(full ?? undefined, closeDialog)}
          </React.Fragment>
        )}
      </DialogContent>
    </Dialog>
  );
}

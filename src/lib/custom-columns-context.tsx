import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectedProject } from "~/lib/selected-project";
import { useHasRole } from "~/lib/use-current-user";
import { EMPTY_ARRAY, CUSTOM_FIELD_SLOT_COUNT } from "~/lib/fef-helpers";
import { moveInOrder } from "~/lib/custom-fields";
import {
  addCustomFieldDef,
  clearCustomFieldData,
  customFieldDefsQueryOptions,
  invalidateCustomFieldQueries,
  removeCustomFieldDef,
  renameCustomFieldDef,
  reorderCustomFieldDefs,
  restoreCustomFieldDef,
  type CustomFieldDefItem,
  type RemovedCustomField,
} from "~/utils/customFields";

/**
 * One owner for a sheet's custom-column actions.
 *
 * Two places manage these columns — the `+ Column` popover and the ⋯ menu on
 * each column's own header — and they cannot each keep their own state. The
 * reason is the undo: removing a column from its header makes that header
 * disappear, so the "Removed X — Undo" affordance has nowhere local to live.
 * Holding it here lets the toolbar show it regardless of which surface did the
 * removing.
 *
 * Consumers outside a provider get `canEdit: false` and no-op actions, so a
 * custom column header still renders its label in any table that has not been
 * wrapped.
 */
export type CustomColumnsValue = {
  defs: CustomFieldDefItem[];
  /** APPROVER-gated; the server enforces it too. */
  canEdit: boolean;
  /** Any mutation in flight — disables every action to avoid overlapping writes. */
  busy: boolean;
  error: unknown;
  atCapacity: boolean;
  addPending: boolean;
  /** The last removal, while it can still be put back. */
  undoable: RemovedCustomField | null;
  add: (label: string) => void;
  rename: (id: number, label: string) => void;
  remove: (id: number) => void;
  clearData: (id: number) => void;
  move: (id: number, delta: -1 | 1) => void;
  undo: () => void;
  dismissUndo: () => void;
};

const noop = () => {};
const OUTSIDE_PROVIDER: CustomColumnsValue = {
  defs: EMPTY_ARRAY as CustomFieldDefItem[],
  canEdit: false,
  busy: false,
  error: null,
  atCapacity: false,
  addPending: false,
  undoable: null,
  add: noop,
  rename: noop,
  remove: noop,
  clearData: noop,
  move: noop,
  undo: noop,
  dismissUndo: noop,
};

const CustomColumnsContext =
  React.createContext<CustomColumnsValue>(OUTSIDE_PROVIDER);

export const useCustomColumns = () => React.useContext(CustomColumnsContext);

export function CustomColumnsProvider({
  discipline,
  children,
}: {
  discipline: string;
  children: React.ReactNode;
}) {
  const { projectId } = useSelectedProject();
  const queryClient = useQueryClient();
  const canEdit = useHasRole("APPROVER");
  const [undoable, setUndoable] = React.useState<RemovedCustomField | null>(
    null,
  );

  const { data: defs = EMPTY_ARRAY as CustomFieldDefItem[] } = useQuery(
    customFieldDefsQueryOptions(projectId, discipline),
  );

  const settle = React.useCallback(
    () => invalidateCustomFieldQueries(queryClient, projectId, discipline),
    [queryClient, projectId, discipline],
  );

  const addMut = useMutation({
    mutationFn: (label: string) =>
      addCustomFieldDef({ data: { projectId: projectId!, discipline, label } }),
    onSuccess: settle,
  });
  const renameMut = useMutation({
    mutationFn: (input: { id: number; label: string }) =>
      renameCustomFieldDef({ data: input }),
    onSuccess: settle,
  });
  const removeMut = useMutation({
    mutationFn: (id: number) => removeCustomFieldDef({ data: { id } }),
    onSuccess: (removed) => {
      setUndoable(removed);
      settle();
    },
  });
  const restoreMut = useMutation({
    mutationFn: (r: RemovedCustomField) => restoreCustomFieldDef({ data: r }),
    onSuccess: () => {
      setUndoable(null);
      settle();
    },
  });
  const reorderMut = useMutation({
    mutationFn: (orderedIds: number[]) =>
      reorderCustomFieldDefs({
        data: { projectId: projectId!, discipline, orderedIds },
      }),
    onSuccess: settle,
  });
  const clearMut = useMutation({
    mutationFn: (id: number) => clearCustomFieldData({ data: { id } }),
    onSuccess: settle,
  });

  const busy =
    addMut.isPending ||
    renameMut.isPending ||
    removeMut.isPending ||
    restoreMut.isPending ||
    reorderMut.isPending ||
    clearMut.isPending;

  const value = React.useMemo<CustomColumnsValue>(
    () => ({
      defs,
      canEdit,
      busy,
      error:
        addMut.error ??
        renameMut.error ??
        removeMut.error ??
        restoreMut.error ??
        reorderMut.error ??
        clearMut.error,
      atCapacity: defs.length >= CUSTOM_FIELD_SLOT_COUNT,
      addPending: addMut.isPending,
      undoable,
      add: (label) => addMut.mutate(label),
      rename: (id, label) => renameMut.mutate({ id, label }),
      remove: (id) => removeMut.mutate(id),
      clearData: (id) => clearMut.mutate(id),
      move: (id, delta) => {
        const ids = defs.map((d) => d.id);
        const next = moveInOrder(ids, id, delta);
        // `moveInOrder` clamps, so nudging past an end yields the same order —
        // don't spend a write on it.
        if (next.every((v, i) => v === ids[i])) return;
        reorderMut.mutate(next);
      },
      undo: () => {
        if (undoable) restoreMut.mutate(undoable);
      },
      dismissUndo: () => setUndoable(null),
    }),
    [
      defs,
      canEdit,
      busy,
      undoable,
      addMut,
      renameMut,
      removeMut,
      restoreMut,
      reorderMut,
      clearMut,
    ],
  );

  return (
    <CustomColumnsContext.Provider value={value}>
      {children}
    </CustomColumnsContext.Provider>
  );
}

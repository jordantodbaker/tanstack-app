import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invalidateAdminEntity,
  type AdminEntity,
} from "~/lib/admin-invalidations";
import { AdminPageHeader } from "~/components/Admin/AdminPageHeader";
import { Th, TableEmptyState } from "~/components/ui/list-page";

/**
 * Wires the upsert + delete mutations for an admin list page. Both share the
 * same `invalidateAdminEntity` fan-out on success, which keeps every linked
 * admin cache in sync. `deleteFn` is optional — the Users page is edit-only.
 *
 * Returns `errorMessage` from upsert only; delete errors propagate up to the
 * dialog that triggered them via the rejected promise.
 */
export function useAdminMutations<TInput>({
  entity,
  upsertFn,
  deleteFn,
}: {
  entity: AdminEntity;
  upsertFn: (args: { data: TInput }) => Promise<unknown>;
  deleteFn?: (args: { data: { id: number } }) => Promise<unknown>;
}): {
  onSubmit: (input: TInput) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  errorMessage: string | null;
} {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateAdminEntity(queryClient, entity);

  const upsert = useMutation({
    mutationFn: (input: TInput) => upsertFn({ data: input }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      deleteFn ? deleteFn({ data: { id } }) : Promise.resolve(),
    onSuccess: invalidate,
  });

  return {
    onSubmit: (input: TInput) => upsert.mutateAsync(input),
    onDelete: deleteFn ? (id: number) => remove.mutateAsync(id) : undefined,
    errorMessage: upsert.isError ? (upsert.error as Error).message : null,
  };
}

/**
 * Page-level chrome for an admin list page: header + optional error banner
 * + (precondition / empty-state / table) body. Row markup varies per entity,
 * so `renderRow` stays in the caller — only the repeated surrounding
 * scaffolding moves here.
 */
export function AdminListPage<TItem>({
  icon,
  title,
  subtitle,
  action,
  errorMessage,
  items,
  emptyMessage,
  preconditionMessage,
  columns,
  renderRow,
  containerClass = "max-w-5xl",
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  /** Shown above the table when set (e.g. an upsert error banner). */
  errorMessage?: string | null;
  items: TItem[];
  emptyMessage: string;
  /** When set, shown instead of the empty state or table (e.g. Areas'
   *  "Create a project first" guard before the table is meaningful). */
  preconditionMessage?: string | null;
  columns: string[];
  renderRow: (item: TItem) => React.ReactNode;
  /** Overrides the default `max-w-5xl` page width (Subcontractors wants 6xl). */
  containerClass?: string;
}) {
  return (
    <main className={`p-4 ${containerClass} space-y-6`}>
      <AdminPageHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        action={action}
      />
      {errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
      {preconditionMessage ? (
        <TableEmptyState message={preconditionMessage} />
      ) : items.length === 0 ? (
        <TableEmptyState message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <Th key={c}>{c}</Th>
                ))}
              </tr>
            </thead>
            <tbody>{items.map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}

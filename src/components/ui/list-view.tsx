import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { useListFilters } from "~/lib/use-list-filters";
import { matchesListFilters } from "~/lib/list-filtering";
import { useBulkActions, type BulkTableProps } from "~/lib/use-bulk-selection";
import type { BulkRow } from "~/lib/bulk-actions";
import type { Transition } from "~/utils/workflow";
import { DISCIPLINE_FILTER_OPTIONS } from "~/config/disciplines";
import { SelectProjectBanner } from "~/components/SelectProjectBanner";
import {
  BulkActionBar,
  BulkHeaderCell,
  BulkRowCell,
} from "~/components/BulkActionBar";
import {
  FilterSelect,
  StatCardRow,
  TableEmptyState,
  Th,
  Td,
  clickableRowClass,
  type StatCardSpec,
} from "~/components/ui/list-page";

/**
 * The orchestration every change-pipeline list route (CVR / FCO / RFI / Trend /
 * PCO) shares: the upsert / delete / transition / (optional) promote mutations
 * on a common `invalidate`, the search + status (+ optional discipline) filter
 * state, the derived `filtered` rows, and the bulk-action wiring over them. The
 * route supplies the entity-specific pieces (query data, server fns, the
 * haystack/discipline accessors) and keeps its own stats, columns, and dialog.
 *
 * `accessors` must be stable across renders (memoise it, or its fields) — it
 * feeds the `matchesFilters`/`filtered` memos, like the hand-written predicates
 * each route used to inline.
 */
export function useListPage<
  ListItem extends BulkRow & { status: S },
  S extends string,
  UpsertInput,
>({
  items,
  projectId,
  searchQ,
  upsertFn,
  deleteFn,
  transitionFn,
  promoteFn,
  invalidate,
  transitions,
  entityNoun,
  accessors,
  extraFilter,
}: {
  items: ListItem[];
  projectId: number | null;
  /** The route's current `?q` (`Route.useSearch().q`) — seeds the search box. */
  searchQ: string | undefined;
  upsertFn: (args: {
    data: UpsertInput & { projectId: number };
  }) => Promise<unknown>;
  deleteFn: (args: { data: { id: number } }) => Promise<unknown>;
  transitionFn: (args: {
    data: { id: number; action: string };
  }) => Promise<unknown>;
  /** Cross-entity promotion (Trend→CVR, RFI→FCO, FCO→CVR). Omit when none. */
  promoteFn?: (id: number) => Promise<unknown>;
  /** Entity invalidate + any cross-entity fan-out, built by the caller. */
  invalidate: () => void;
  transitions: Record<S, Transition<S>[]>;
  entityNoun: string;
  accessors: {
    discipline?: (item: ListItem) => string | null | undefined;
    haystack: (item: ListItem) => string;
  };
  /** Extra per-row predicate ANDed with the shared filters (e.g. FCO's
   *  linked/unlinked filter). Must be stable across renders. */
  extraFilter?: (item: ListItem) => boolean;
}) {
  const upsert = useMutation({
    mutationFn: (input: UpsertInput & { projectId: number }) =>
      upsertFn({ data: input }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
  });
  const transition = useMutation({
    mutationFn: (input: { id: number; action: string }) =>
      transitionFn({ data: input }),
    onSuccess: invalidate,
  });
  const promote = useMutation({
    mutationFn: (id: number) =>
      promoteFn ? promoteFn(id) : Promise.resolve(undefined),
    onSuccess: invalidate,
  });

  const filters = useListFilters<S>(searchQ);
  const { deferredSearch, statusFilter, disciplineFilter } = filters;

  const matchesFilters = React.useCallback(
    (it: ListItem): boolean =>
      matchesListFilters(
        it,
        { search: deferredSearch, statusFilter, disciplineFilter },
        {
          status: (i) => i.status,
          discipline: accessors.discipline,
          haystack: accessors.haystack,
        },
      ),
    [deferredSearch, statusFilter, disciplineFilter, accessors],
  );

  const filtered = React.useMemo(
    () =>
      items.filter(
        (it) => matchesFilters(it) && (extraFilter ? extraFilter(it) : true),
      ),
    [items, matchesFilters, extraFilter],
  );

  const bulk = useBulkActions({
    rows: filtered,
    transitions,
    entityNoun,
    onTransition: (input) => transition.mutateAsync(input),
    onDelete: (id) => remove.mutateAsync(id),
    invalidate,
  });

  const projectScoped = projectId !== null;

  const handleSubmit = (input: Omit<UpsertInput, "projectId">) => {
    if (!projectScoped) return Promise.resolve();
    return upsert.mutateAsync({
      ...input,
      projectId,
    } as UpsertInput & { projectId: number });
  };
  const handleDelete = (id: number) => remove.mutateAsync(id);
  const handleTransition = (input: { id: number; action: string }) =>
    transition.mutateAsync(input);
  const handlePromote = (id: number) => promote.mutateAsync(id);

  return {
    filters,
    matchesFilters,
    filtered,
    bulk,
    projectScoped,
    handleSubmit,
    handleDelete,
    handleTransition,
    handlePromote,
  };
}

/**
 * One table column: drives both the `<Th>` header and the per-row `<Td>` cell,
 * so a route declares its columns once instead of keeping a parallel header
 * list and cell block in sync. `cellClassName` carries the per-column cell
 * styling the routes used to append to `cellCls` (e.g. `align-top text-right
 * tabular-nums`).
 */
export type ListColumn<Item> = {
  header: React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  cell: (item: Item) => React.ReactNode;
};

/**
 * The table shell shared by the list routes: empty state, the scroll wrapper,
 * the bulk-select header column, the column headers, and one clickable row per
 * item. Each row is the entity edit dialog's trigger, so the route supplies
 * `renderRowDialog` to wrap the shared `<tr>` — everything else is generic.
 */
export function ListTable<Item extends { id: number }>({
  items,
  columns,
  renderRowDialog,
  emptyMessage,
  rowClassName,
  bulk,
}: {
  items: Item[];
  columns: ListColumn<Item>[];
  renderRowDialog: (item: Item, trigger: React.ReactNode) => React.ReactNode;
  emptyMessage: string;
  /** Extra row classes merged after `clickableRowClass` (e.g. FCO highlight). */
  rowClassName?: (item: Item) => string | undefined;
  bulk: BulkTableProps;
}) {
  if (items.length === 0) {
    return <TableEmptyState message={emptyMessage} />;
  }
  const { selected, onToggle, onToggleAll, allSelected, someSelected } = bulk;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <BulkHeaderCell
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleAll={onToggleAll}
            />
            {columns.map((c, i) => (
              <Th key={i} className={c.headerClassName}>
                {c.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <React.Fragment key={item.id}>
              {renderRowDialog(
                item,
                <tr className={cn(clickableRowClass, rowClassName?.(item))}>
                  <BulkRowCell
                    checked={selected.has(item.id)}
                    onToggle={() => onToggle(item.id)}
                  />
                  {columns.map((c, i) => (
                    <Td key={i} className={c.cellClassName}>
                      {c.cell(item)}
                    </Td>
                  ))}
                </tr>,
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Page chrome for a list route: the header (icon + title + description +
 * "New …" action), the select-a-project banner, the stat-card row, the filter
 * bar (search + status + optional discipline + "showing N of M" + export), the
 * bulk-action bar, and the table slot in `children`. Everything entity-specific
 * is passed in; the layout owns the arrangement every route repeated.
 */
export function ListPageLayout({
  icon: Icon,
  iconClassName,
  title,
  description,
  newAction,
  projectScoped,
  bannerText,
  cards,
  search,
  setSearch,
  searchPlaceholder,
  statusFilter,
  setStatusFilter,
  statusOptions,
  disciplineFilter,
  setDisciplineFilter,
  extraFilters,
  filteredCount,
  totalCount,
  exportButton,
  bulkBar,
  children,
}: {
  /** Header icon; omit for a plain text title (Change Log has none). */
  icon?: React.ElementType;
  iconClassName?: string;
  title: string;
  description: React.ReactNode;
  newAction: React.ReactNode;
  projectScoped: boolean;
  bannerText: React.ReactNode;
  cards: StatCardSpec[];
  search: string;
  setSearch: (v: string) => void;
  searchPlaceholder: string;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  statusOptions: { value: string; label: string }[];
  /** Pass the discipline pair to show the discipline filter; omit for PCO. */
  disciplineFilter?: string;
  setDisciplineFilter?: (v: string) => void;
  /** Extra filter controls rendered after the status/discipline selects
   *  (e.g. FCO's linkage filter). */
  extraFilters?: React.ReactNode;
  filteredCount: number;
  totalCount: number;
  /** The entity's `<ExportCsvButton>` (its CSV columns are entity-specific). */
  exportButton: React.ReactNode;
  bulkBar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1
            className={cn(
              "text-2xl font-bold text-slate-800",
              Icon && "flex items-center gap-2",
            )}
          >
            {Icon && <Icon className={cn("size-6", iconClassName)} />}
            {title}
          </h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {newAction}
      </div>

      {!projectScoped && <SelectProjectBanner>{bannerText}</SelectProjectBanner>}

      <StatCardRow cards={cards} />

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-7 w-full sm:w-80"
          />
        </div>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
        />
        {setDisciplineFilter && (
          <FilterSelect
            label="Discipline"
            value={disciplineFilter ?? ""}
            onChange={setDisciplineFilter}
            options={[
              { value: "", label: "All disciplines" },
              ...DISCIPLINE_FILTER_OPTIONS,
            ]}
          />
        )}
        {extraFilters}
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <span className="text-xs text-slate-500">
            Showing {filteredCount} of {totalCount}
          </span>
          {exportButton}
        </div>
      </div>

      {bulkBar}

      {children}
    </main>
  );
}

export { BulkActionBar };

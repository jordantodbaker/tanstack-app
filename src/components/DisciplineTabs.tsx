import React from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";

import { LoadMask } from "~/components/LoadMask";
import { EMPTY_ARRAY, tabTriggerClass } from "~/lib/fef-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import type { FefRow } from "~/lib/types";
import {
  useTakeOffSync,
  makeBlankRow,
  FIELD_ESTIMATE_INITIAL_ROWS,
  useFefTableState,
  FefTableContent,
  SelectionCheckboxCell,
  type FefTableMeta,
  type FefTableState,
  type ServerPagination,
  type ColumnGroup,
} from "~/lib/table-utils";
import { isTakeOffRowInvalid, fefRowHasUserData } from "~/lib/fef-helpers";
import {
  ERROR_FILTER_COLUMN_ID,
  countInvalidRows,
  invalidRowIndices,
  isRowInErrorFilter,
} from "~/lib/take-off-errors";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import { useFefRowPersistence } from "~/lib/use-fef-row-persistence";
import { useFefUndo } from "~/lib/use-fef-undo";
import { SaveIndicator, combineSaveStatus } from "~/components/SaveIndicator";
import { TakeOffPasteDialog } from "~/components/TakeOffPasteDialog";
import { ChangelogDialog } from "~/components/Changelog/ChangelogDialog";
import { buildCvrDraftFromFefRows } from "~/lib/fef-to-cvr";
import {
  upsertChangeLog,
  invalidateChangeLogQueries,
  type UpsertChangeLogInput,
} from "~/utils/changelog";
import { Undo2, Redo2, AlertTriangle } from "lucide-react";
import { splitRowsByDiscipline } from "~/lib/take-off-paste";
import { computeTakeOffTotals } from "~/lib/take-off-totals";
import { makeTakeOffCsvColumns, takeOffRowsForExport } from "~/lib/take-off-csv";
import { rowsToCsv, downloadCsv, todayStamp } from "~/lib/csv-export";
import { formatCurrency } from "~/lib/formatting";
import { appendTakeOffRows } from "~/utils/fefRows";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFieldDefsQueryOptions } from "~/utils/customFields";
import { CustomColumnsButton } from "~/components/CustomColumnsButton";
import { CustomColumnsProvider } from "~/lib/custom-columns-context";
import { CustomColumnsUndoBar } from "~/components/CustomColumnsUndoBar";
import { qk } from "~/lib/query-keys";
import { disciplineById } from "~/config/disciplines";

const selectionColumnHelper = createColumnHelper<FefRow>();
const takeOffSelectionColumn: ColumnDef<FefRow, string> =
  selectionColumnHelper.display({
    id: "__select",
    header: () => null,
    cell: SelectionCheckboxCell,
    size: 36,
  }) as ColumnDef<FefRow, string>;

/**
 * Take Off row-level validator. The predicate accepts a full FefRow shape;
 * we just hand it off. Picking any field (schedule, role, task code, name,
 * a CBS code, etc.) marks the row as "started"; if Total Cost can't be
 * computed, the row is flagged.
 */
const isTakeOffRowInvalidLive = (row: FefRow): boolean =>
  isTakeOffRowInvalid(row);

/**
 * Carrier for the toolbar's "errors only" view filter.
 *
 * A zero-width hidden column rather than a global filter: TanStack evaluates a
 * column filter exactly once per row, while a global filter is fanned out over
 * every column (and is skipped altogether unless a column opts in), so this
 * both costs less on a 400-row sheet and can't be silently disabled by the
 * columns a given discipline happens to define. It renders nothing — the
 * filter value does all the work; see `~/lib/take-off-errors.ts`.
 */
const takeOffErrorFilterColumn: ColumnDef<FefRow, string> =
  selectionColumnHelper.accessor((row) => (isTakeOffRowInvalid(row) ? "1" : ""), {
    id: ERROR_FILTER_COLUMN_ID,
    header: () => null,
    cell: () => null,
    size: 0,
    filterFn: (row, _columnId, pinned: ReadonlySet<number>) =>
      isRowInErrorFilter(row.original, row.index, pinned),
  }) as ColumnDef<FefRow, string>;

/**
 * Keep a buffer of empty, editable rows at the bottom of the sheet. The user
 * can always start another row, and — now that the grid supports Ctrl+D
 * fill-down — there's a block of real empty rows to fill into (rather than the
 * old single trailing blank + non-editable filler). Ensures at least
 * `minTrailing` trailing empty rows (no user data) and at least `minTotal` rows
 * overall, topping up as the buffer is consumed.
 *
 * Empty `__fe-blank-` rows aren't persisted (`saveFefRows` drops them), so the
 * buffer costs nothing in the DB. Each top-up is a pure trailing-blank append,
 * so it settles in one pass and is folded into the prior undo step (see
 * `isTrailingBlankAppend`).
 */
function useEnsureTrailingBlankRows(
  state: FefTableState,
  minTrailing: number,
  minTotal = 0,
) {
  const nextBlankId = React.useRef(1);
  const { data, setData } = state;
  React.useEffect(() => {
    let trailing = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const r = data[i];
      if (r.id.startsWith("__fe-blank-") && !fefRowHasUserData(r)) trailing++;
      else break;
    }
    const need = Math.max(minTrailing - trailing, minTotal - data.length);
    if (need <= 0) return;
    setData((prev) => {
      const next = prev.slice();
      for (let i = 0; i < need; i++) {
        next.push(makeBlankRow(nextBlankId.current++));
      }
      return next;
    });
  }, [data, setData, minTrailing, minTotal]);
}

export type DisciplineTabsProps = {
  /** When provided, renders a `<main>` wrapper with an `<h1>` header. */
  title?: string;
  icon?: React.ElementType;
  /** Discipline id used for fefRow persistence. */
  discipline: string;
  takeOffColumns: ColumnDef<FefRow, string>[];
  /** Grouped-header bands for the Take Off sheet (Excel-style banner row). */
  takeOffColumnGroups?: ColumnGroup[];
  craftColumns: ColumnDef<FefRow, string>[];
  supportLaborColumns: ColumnDef<FefRow, string>[];
  takeOffMeta?: FefTableMeta;
  craftMeta?: FefTableMeta;
  supportLaborMeta?: FefTableMeta;
  supportLaborInitialRows?: FefRow[];
  serverPagination?: ServerPagination;
};

export function DisciplineTabs({
  title,
  icon: Icon,
  discipline,
  takeOffColumns,
  takeOffColumnGroups,
  craftColumns,
  supportLaborColumns,
  takeOffMeta,
  craftMeta,
  supportLaborMeta,
  supportLaborInitialRows,
  serverPagination,
}: DisciplineTabsProps) {
  const initialTakeOffRows = React.useMemo(() => [makeBlankRow(0)], []);
  const takeOffState = useFefTableState({ initialRows: initialTakeOffRows });
  const fieldEstimateState = useFefTableState({
    initialRows: FIELD_ESTIMATE_INITIAL_ROWS,
  });
  const supportLaborState = useFefTableState({
    initialRows: supportLaborInitialRows,
  });

  const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);

  const { projectId } = useSelectedProject();
  const { versionId } = useSelectedVersion();
  const takeOffPersist = useFefRowPersistence({
    versionId,
    discipline,
    section: "TAKE_OFF",
    state: takeOffState,
    emptyRows: initialTakeOffRows,
  });
  const supportPersist = useFefRowPersistence({
    versionId,
    discipline,
    section: "SUPPORT_LABOR",
    state: supportLaborState,
    fallbackRows: supportLaborInitialRows,
  });
  const isTakeOffLoading = takeOffPersist.isLoading;

  // One page-level autosave headline across both persisted sections.
  const saveStatus = combineSaveStatus([
    takeOffPersist.saveStatus,
    supportPersist.saveStatus,
  ]);
  const lastSavedAt =
    Math.max(takeOffPersist.lastSavedAt ?? 0, supportPersist.lastSavedAt ?? 0) ||
    null;

  // Warn before a browser refresh/close while a save is pending, in flight, or
  // failed — SPA navigation keeps the debounce timer alive, but unloading the
  // tab would drop it.
  const hasUnsaved =
    saveStatus === "pending" ||
    saveStatus === "saving" ||
    saveStatus === "error";
  React.useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // Auto-append a fresh blank row on both sheets whenever the last row has
  // computable labor, so each always has a trailing row to enter data into.
  // Take Off: fill the sheet with real editable blank rows (≥ the 20-row
  // visible height) and always keep a block of empties to fill down into.
  useEnsureTrailingBlankRows(takeOffState, 8, 20);
  // Support Labor: just keep one trailing blank for the next entry.
  useEnsureTrailingBlankRows(supportLaborState, 1);

  const [selectedRowIndices, setSelectedRowIndices] = React.useState<
    Set<number>
  >(() => new Set());
  const onToggleRowSelected = React.useCallback((rowIndex: number) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);
  // Wraps the default delete so the selection set stays consistent with the
  // post-delete indices (rows below the deleted one shift up by one).
  const handleDeleteTakeOffRow = React.useCallback(
    (rowIndex: number) => {
      // Tells the save path a HUMAN removed this row. Emptying a sheet is
      // refused without it, so a render loop or bad hydration can no longer
      // masquerade as "the user deleted everything".
      takeOffPersist.notifyRowsRemoved();
      takeOffState.setData((old) => old.filter((_, i) => i !== rowIndex));
      setSelectedRowIndices((prev) => {
        const next = new Set<number>();
        prev.forEach((idx) => {
          if (idx < rowIndex) next.add(idx);
          else if (idx > rowIndex) next.add(idx - 1);
        });
        return next;
      });
    },
    [takeOffState, takeOffPersist],
  );

  // Undo/redo over the Take Off sheet. Enabled only once persistence has
  // hydrated (so the initial DB load isn't recorded as an edit), and reset
  // when the project/discipline row set is swapped. Undo/redo clear the
  // selection since post-restore row indices may no longer line up.
  const { undo, redo, canUndo, canRedo } = useFefUndo(takeOffState, {
    enabled: !isTakeOffLoading,
    resetKey: `${versionId}|${discipline}`,
  });
  const handleUndo = React.useCallback(() => {
    undo();
    setSelectedRowIndices(new Set());
  }, [undo]);
  const handleRedo = React.useCallback(() => {
    redo();
    setSelectedRowIndices(new Set());
  }, [redo]);

  const queryClient = useQueryClient();
  // Transient notice when pasted rows are routed to other disciplines' sheets.
  const [routedNotice, setRoutedNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!routedNotice) return;
    const t = setTimeout(() => setRoutedNotice(null), 8000);
    return () => clearTimeout(t);
  }, [routedNotice]);

  // Append pasted rows. Rows whose CBS code belongs to another discipline are
  // routed to that discipline's Take Off (persisted server-side, since that
  // page isn't open); the rest are appended to this sheet before its trailing
  // blank template row so the grid keeps a ready-to-type last row.
  const handlePasteAppend = React.useCallback(
    (rows: FefRow[]) => {
      if (rows.length === 0) return;
      const { local, byDiscipline } = splitRowsByDiscipline(rows, discipline);

      if (local.length > 0) {
        takeOffState.setData((prev) => {
          const last = prev[prev.length - 1];
          const lastIsBlank =
            !!last &&
            last.id.startsWith("__fe-blank-") &&
            !fefRowHasUserData(last);
          return lastIsBlank
            ? [...prev.slice(0, -1), ...local, last]
            : [...prev, ...local];
        });
      }

      if (byDiscipline.size === 0 || versionId === null) return;

      const groups = [...byDiscipline].map(([disciplineId, discRows]) => ({
        discipline: disciplineId,
        rows: discRows,
      }));
      appendTakeOffRows({ data: { versionId, groups } })
        .then((routed) => {
          for (const g of routed) {
            queryClient.invalidateQueries({
              queryKey: qk.fefRows.sheet(versionId, g.discipline, "TAKE_OFF"),
            });
          }
          queryClient.invalidateQueries({
            queryKey: qk.projectFefRowTotals(versionId),
          });
          queryClient.invalidateQueries({
            queryKey: qk.invalidByDiscipline(versionId),
          });
          const total = routed.reduce((sum, g) => sum + g.count, 0);
          if (total > 0) {
            const names = routed
              .map((g) => disciplineById[g.discipline]?.label ?? g.discipline)
              .join(", ");
            setRoutedNotice(
              `${total} row${total === 1 ? "" : "s"} routed to ${names} Take Off.`,
            );
          }
        })
        .catch(() => {
          setRoutedNotice(
            "Some pasted rows could not be routed to their disciplines.",
          );
        });
    },
    [discipline, versionId, takeOffState, queryClient],
  );

  const takeOffTotals = React.useMemo(
    () => computeTakeOffTotals(takeOffState.data),
    [takeOffState.data],
  );

  // This discipline's custom columns, for the CSV export below. React Query
  // dedupes this with the identical query inside CustomColumnsButton.
  const { data: customFieldDefs = EMPTY_ARRAY } = useQuery(
    customFieldDefsQueryOptions(projectId, discipline),
  );

  const handleExportCsv = React.useCallback(() => {
    const areaOptions = takeOffMeta?.areaOptions ?? [];
    const areaLabelFor = (id: string) =>
      areaOptions.find((o) => o.value === id)?.label ?? id;
    const rows = takeOffRowsForExport(takeOffState.data);
    const csv = rowsToCsv(
      rows,
      makeTakeOffCsvColumns(areaLabelFor, customFieldDefs),
    );
    downloadCsv(`${discipline || "take-off"}-takeoff-${todayStamp()}.csv`, csv);
  }, [takeOffState.data, discipline, takeOffMeta, customFieldDefs]);

  // Build a pre-filled CVR draft from the currently-selected take-off rows —
  // each becomes a LABOR cost-buildup line (hours × rate). Recomputed as the
  // selection changes; read by the ChangelogDialog when it opens.
  const cvrDraft = React.useMemo(() => {
    const rows = Array.from(selectedRowIndices)
      .sort((a, b) => a - b)
      .map((i) => takeOffState.data[i])
      .filter((r): r is FefRow => !!r);
    return buildCvrDraftFromFefRows(rows, {
      discipline,
      disciplineLabel: disciplineById[discipline]?.label,
    });
  }, [selectedRowIndices, takeOffState.data, discipline]);

  const handleCreateCvr = React.useCallback(
    async (form: Omit<UpsertChangeLogInput, "projectId">) => {
      if (projectId === null) return;
      await upsertChangeLog({ data: { ...form, projectId } });
      invalidateChangeLogQueries(queryClient, projectId);
      setSelectedRowIndices(new Set());
    },
    [projectId, queryClient],
  );

  const takeOffColumnsWithSelection = React.useMemo(
    () => [takeOffSelectionColumn, ...takeOffColumns, takeOffErrorFilterColumn],
    [takeOffColumns],
  );

  // ── "Errors only" view filter ────────────────────────────────────────────
  // The count is live (it drops as rows are fixed); the *filter* pins the rows
  // that were in error when it was switched on, so a row doesn't vanish
  // mid-edit the instant it becomes valid. See `~/lib/take-off-errors.ts`.
  const takeOffRows = takeOffState.data;
  const takeOffErrorCount = React.useMemo(
    () => countInvalidRows(takeOffRows),
    [takeOffRows],
  );
  const { columnFilters: takeOffFilters, setColumnFilters: setTakeOffFilters } =
    takeOffState;
  const errorsOnly = takeOffFilters.some((f) => f.id === ERROR_FILTER_COLUMN_ID);

  const clearErrorFilter = React.useCallback(() => {
    setTakeOffFilters((prev) =>
      prev.filter((f) => f.id !== ERROR_FILTER_COLUMN_ID),
    );
  }, [setTakeOffFilters]);

  const toggleErrorsOnly = React.useCallback(() => {
    setTakeOffFilters((prev) => {
      const without = prev.filter((f) => f.id !== ERROR_FILTER_COLUMN_ID);
      if (prev.length !== without.length) return without;
      return [
        ...without,
        { id: ERROR_FILTER_COLUMN_ID, value: invalidRowIndices(takeOffRows) },
      ];
    });
  }, [setTakeOffFilters, takeOffRows]);

  // The pinned set is a set of row indices, and an insert or delete renumbers
  // every row below it — which would leave the filter showing rows that were
  // never in error. Rows are otherwise only edited or appended to, so a change
  // in row count is the signal that the pins are stale. Drop the filter rather
  // than show the wrong rows.
  const takeOffRowCount = takeOffRows.length;
  const lastRowCount = React.useRef(takeOffRowCount);
  React.useEffect(() => {
    if (lastRowCount.current === takeOffRowCount) return;
    lastRowCount.current = takeOffRowCount;
    if (errorsOnly) clearErrorFilter();
  }, [takeOffRowCount, errorsOnly, clearErrorFilter]);
  const takeOffWithSelection: FefTableMeta = {
    ...takeOffMeta,
    selectedRowIndices,
    onToggleRowSelected,
    deleteRow: handleDeleteTakeOffRow,
    onRowsRemoved: takeOffPersist.notifyRowsRemoved,
  };

  // "Use Crew Mix" mode swaps the Role column for the Crew Mix column and
  // hides Schedule (crew mixes already encode the rate). Toggle is local to
  // this mount — not persisted per-row or per-discipline — because it
  // controls input mode, not row data. Existing rows keep whichever
  // input (role+schedule OR crewMixId) was last written to them.
  const [useCrewMix, setUseCrewMix] = React.useState(false);
  // Collapsed header groups — their columns are hidden. Seeded from each
  // group's `defaultCollapsed` so a wide sheet can open focused.
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    () =>
      new Set(
        (takeOffColumnGroups ?? [])
          .filter((g) => g.defaultCollapsed)
          .map((g) => g.label),
      ),
  );
  const toggleGroup = React.useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);
  const takeOffColumnVisibility = React.useMemo<VisibilityState>(
    () => ({
      // Carries the errors-only filter; never rendered.
      [ERROR_FILTER_COLUMN_ID]: false,
      role: !useCrewMix,
      crewMixId: useCrewMix,
      schedule: !useCrewMix,
      // Hide every column of a collapsed group (incl. the Labor & Cost group,
      // which stands in for the old "Show Details" toggle).
      ...Object.fromEntries(
        (takeOffColumnGroups ?? [])
          .filter((g) => collapsedGroups.has(g.label))
          .flatMap((g) => g.columnIds.map((id) => [id, false] as const)),
      ),
    }),
    [useCrewMix, takeOffColumnGroups, collapsedGroups],
  );

  const [activeTab, setActiveTab] = React.useState("takeoff");
  const [isTabSwitching, startTabTransition] = React.useTransition();
  const handleTabChange = (v: string) => {
    startTabTransition(() => {
      setActiveTab(v);
      if (v === "estimate") syncToFieldEstimate();
    });
  };
  const showMask = isTakeOffLoading || isTabSwitching;

  // Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo), only while the
  // Take Off tab is active. Ignored when focus is in an editable control so a
  // cell's native text-undo keeps working; use the toolbar buttons to
  // undo/redo row changes while editing.
  React.useEffect(() => {
    if (activeTab !== "takeoff") return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, handleUndo, handleRedo]);

  const inner = (
    <>
      {showMask && <LoadMask />}
      {routedNotice && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
          <span>{routedNotice}</span>
          <button
            type="button"
            onClick={() => setRoutedNotice(null)}
            aria-label="Dismiss"
            className="shrink-0 text-blue-400 hover:text-blue-700"
          >
            ×
          </button>
        </div>
      )}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        {/* Title, sheet tabs and save state share one row. They used to stack
            as three blocks, which cost ~110px before any data — a third of a
            laptop viewport gone above the grid. The tabs sit next to the title
            because they name what the page is showing, so reading them
            together is no loss. */}
        <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-200 pb-1.5">
          <div className="flex min-w-0 items-center gap-3">
            {title ? (
              <h1 className="flex shrink-0 items-center gap-2 text-lg md:text-xl font-bold">
                {Icon && <Icon className="size-5 md:size-6" />}
                {title}
              </h1>
            ) : (
              <span />
            )}
            {/* `overflow-visible` and `shrink-0` both undo defaults that do not
                apply here. The TabsList base sets `max-w-full overflow-x-auto`
                so a tab strip can scroll inside a narrow entity dialog; on a
                full-width page that only risks painting a scrollbar across a
                30px-tall two-button switch, since setting one overflow axis to
                auto makes the other compute to auto as well. `shrink-0` keeps
                a long discipline title from squeezing the strip into that
                state in the first place. */}
            <TabsList className="h-auto shrink-0 gap-1.5 overflow-visible rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto">
              <TabsTrigger value="takeoff" className={tabTriggerClass}>
                Take Off
              </TabsTrigger>
              <TabsTrigger value="estimate" className={tabTriggerClass}>
                Field Estimate
              </TabsTrigger>
            </TabsList>
          </div>
          <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
        </div>
        {/* The provider spans the toolbar AND the grid: the `+ Column`
            popover and the ⋯ menu on each column header act on the same set,
            and the undo after a removal has to survive the header that issued
            it disappearing. */}
        <TabsContent value="takeoff" className="mt-4">
          {/* Spans the toolbar AND the grid: the `+ Column` popover and the ⋯
              menu on each column header act on the same set, and the undo
              after a removal has to outlive the header that issued it.
              A provider renders no DOM of its own. */}
          <CustomColumnsProvider discipline={discipline}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="flex items-center gap-1 px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Undo2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="flex items-center gap-1 px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Redo2 className="size-4" />
              </button>
            </div>
            {/* Errors-only view filter. Doubles as the sheet's error count,
                which is the same number the sidebar's ⚠ badge and the
                Validation page report. Stays enabled while active even at
                zero errors, so the filter can always be switched back off. */}
            <button
              type="button"
              onClick={toggleErrorsOnly}
              disabled={takeOffErrorCount === 0 && !errorsOnly}
              aria-pressed={errorsOnly}
              title={
                errorsOnly
                  ? "Show all rows"
                  : takeOffErrorCount === 0
                    ? "No rows on this sheet have errors"
                    : "Show only rows with errors — rows stay listed while you fix them"
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm border rounded cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                errorsOnly
                  ? "border-[#a63434] bg-[#a63434] text-white hover:bg-[#8d2a2a]"
                  : takeOffErrorCount > 0
                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border-slate-300 text-slate-600 disabled:hover:bg-transparent"
              }`}
            >
              <AlertTriangle className="size-4" />
              {takeOffErrorCount} {takeOffErrorCount === 1 ? "error" : "errors"}
            </button>
            <ChangelogDialog
              trigger={
                <button
                  type="button"
                  disabled={selectedRowIndices.size === 0 || projectId === null}
                  title="Create a CVR pre-filled from the selected take-off rows"
                  className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  Create CVR from Selected
                </button>
              }
              draft={cvrDraft}
              onSubmit={handleCreateCvr}
            />
            {(takeOffColumnGroups ?? []).length > 0 && (
              <span className="text-xs font-medium text-slate-400 self-center">
                Columns:
              </span>
            )}
            {(takeOffColumnGroups ?? []).map((g) => {
              const collapsed = collapsedGroups.has(g.label);
              return (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => toggleGroup(g.label)}
                  aria-pressed={!collapsed}
                  title={collapsed ? `Show ${g.label}` : `Hide ${g.label}`}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border cursor-pointer transition-colors ${
                    collapsed
                      ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                      : "border-slate-400 bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="text-slate-400">{collapsed ? "▸" : "▾"}</span>
                  {g.label}
                </button>
              );
            })}
            <CustomColumnsButton discipline={discipline} />
            <CustomColumnsUndoBar />
            {/* Right-aligned cluster: mode/import/export actions + live totals. */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setUseCrewMix((v) => !v)}
                className={
                  useCrewMix
                    ? "px-3 py-1 text-sm border border-[#a63434] bg-[#a63434] text-white rounded hover:bg-[#8d2a2a] cursor-pointer"
                    : "px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
                }
              >
                {useCrewMix ? "Use Role" : "Use Crew Mix"}
              </button>
              <TakeOffPasteDialog
                cbsOptions={takeOffMeta?.cbsOptions ?? []}
                areaOptions={takeOffMeta?.areaOptions ?? []}
                onAppend={handlePasteAppend}
              />
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={takeOffTotals.itemCount === 0}
                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Export CSV
              </button>
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>
                  <span className="font-semibold text-slate-800">
                    {takeOffTotals.itemCount}
                  </span>{" "}
                  {takeOffTotals.itemCount === 1 ? "item" : "items"}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <span className="font-semibold text-slate-800">
                    {takeOffTotals.laborHours.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}
                  </span>{" "}
                  hrs
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(takeOffTotals.laborCost)}
                </span>
              </div>
            </div>
          </div>
          <FefTableContent
            state={takeOffState}
            meta={takeOffWithSelection}
            columns={takeOffColumnsWithSelection}
            columnGroups={takeOffColumnGroups}
            onToggleGroup={toggleGroup}
            serverPagination={serverPagination}
            columnVisibility={takeOffColumnVisibility}
            minRows={20}
            getRowInvalid={isTakeOffRowInvalidLive}
            enableRangeEditing
            columnWidthKey={`takeoff:${discipline}`}
            // Keep the row identifiable while scrolling right: the selection
            // gutter through Name. Named rather than counted because ID sits
            // between them and lives in a collapsible group — a count froze
            // Name only while ID happened to be hidden.
            frozenThroughColumnId="name"
            frozenColumnCount={2}
          />
          </CustomColumnsProvider>
        </TabsContent>
        <TabsContent value="estimate" className="mt-4">
          <Accordion type="multiple" defaultValue={["support", "craft"]}>
            <AccordionItem value="support">
              <AccordionTrigger>Support Labor</AccordionTrigger>
              <AccordionContent>
                <FefTableContent
                  state={supportLaborState}
                  meta={supportLaborMeta}
                  columns={supportLaborColumns}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="craft">
              <AccordionTrigger>Craft Labor</AccordionTrigger>
              <AccordionContent>
                <FefTableContent
                  state={fieldEstimateState}
                  meta={craftMeta}
                  columns={craftColumns}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
    </>
  );

  if (title) {
    return <main className="relative p-3 md:p-4">{inner}</main>;
  }
  return <div className="relative">{inner}</div>;
}

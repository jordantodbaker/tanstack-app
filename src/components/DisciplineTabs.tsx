import React from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";

/** Columns hidden by default on the Take Off sheet; toggled together by the
 *  "Hide Details" / "Show Details" button. Hidden default keeps the wide
 *  detail columns out of sight for the common take-off workflow.
 *  `laborFactor` only exists on the Piping table — TanStack Table ignores
 *  visibility entries for columns that aren't in the current `columns`
 *  array, so listing it here is a no-op for the other disciplines. */
const DETAILS_COL_IDS = [
  "id",
  "sub",
  "unit",
  "laborFactor",
  "laborHours",
  "laborRate",
  "totalCost",
] as const;
import { LoadMask } from "~/components/LoadMask";
import { tabTriggerClass } from "~/lib/fef-helpers";
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
} from "~/lib/table-utils";
import { isTakeOffRowInvalid, fefRowHasUserData } from "~/lib/fef-helpers";
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
import { Undo2, Redo2 } from "lucide-react";
import { splitRowsByDiscipline } from "~/lib/take-off-paste";
import { computeTakeOffTotals } from "~/lib/take-off-totals";
import { makeTakeOffCsvColumns, takeOffRowsForExport } from "~/lib/take-off-csv";
import { rowsToCsv, downloadCsv, todayStamp } from "~/lib/csv-export";
import { formatCurrency } from "~/lib/formatting";
import { appendTakeOffRows } from "~/utils/fefRows";
import { useQueryClient } from "@tanstack/react-query";
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
    [takeOffState],
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
              queryKey: ["fefRows", versionId, g.discipline, "TAKE_OFF"],
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

  const handleExportCsv = React.useCallback(() => {
    const areaOptions = takeOffMeta?.areaOptions ?? [];
    const areaLabelFor = (id: string) =>
      areaOptions.find((o) => o.value === id)?.label ?? id;
    const rows = takeOffRowsForExport(takeOffState.data);
    const csv = rowsToCsv(rows, makeTakeOffCsvColumns(areaLabelFor));
    downloadCsv(`${discipline || "take-off"}-takeoff-${todayStamp()}.csv`, csv);
  }, [takeOffState.data, discipline, takeOffMeta]);

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
    () => [takeOffSelectionColumn, ...takeOffColumns],
    [takeOffColumns],
  );
  const takeOffWithSelection: FefTableMeta = {
    ...takeOffMeta,
    selectedRowIndices,
    onToggleRowSelected,
    deleteRow: handleDeleteTakeOffRow,
  };

  const [detailsVisible, setDetailsVisible] = React.useState(false);
  // "Use Crew Mix" mode swaps the Role column for the Crew Mix column and
  // hides Schedule (crew mixes already encode the rate). Toggle is local to
  // this mount — not persisted per-row or per-discipline — because it
  // controls input mode, not row data. Existing rows keep whichever
  // input (role+schedule OR crewMixId) was last written to them.
  const [useCrewMix, setUseCrewMix] = React.useState(false);
  const takeOffColumnVisibility = React.useMemo<VisibilityState>(
    () => ({
      ...Object.fromEntries(DETAILS_COL_IDS.map((c) => [c, detailsVisible])),
      role: !useCrewMix,
      crewMixId: useCrewMix,
      schedule: !useCrewMix,
    }),
    [detailsVisible, useCrewMix],
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
      <div className="mb-3 md:mb-4 flex items-center justify-between gap-2">
        {title ? (
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            {Icon && <Icon className="size-6 md:size-7" />}
            {title}
          </h1>
        ) : (
          <span />
        )}
        <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
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
        <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 pb-2 h-auto gap-2">
          <TabsTrigger value="takeoff" className={tabTriggerClass}>
            Take Off
          </TabsTrigger>
          <TabsTrigger value="estimate" className={tabTriggerClass}>
            Field Estimate
          </TabsTrigger>
        </TabsList>
        <TabsContent value="takeoff" className="mt-4">
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
            <button
              onClick={() => setDetailsVisible((v) => !v)}
              className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
            >
              {detailsVisible ? "Hide Details" : "Show Details"}
            </button>
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
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
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
          <FefTableContent
            state={takeOffState}
            meta={takeOffWithSelection}
            columns={takeOffColumnsWithSelection}
            serverPagination={serverPagination}
            columnVisibility={takeOffColumnVisibility}
            minRows={20}
            getRowInvalid={isTakeOffRowInvalidLive}
            enableRangeEditing
            frozenColumnCount={2}
          />
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

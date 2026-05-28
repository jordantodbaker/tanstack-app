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
import { canComputeTotalCost, tabTriggerClass } from "~/lib/fef-helpers";
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
  type ServerPagination,
} from "~/lib/table-utils";
import { isTakeOffRowInvalid } from "~/lib/fef-helpers";
import { useSelectedProject } from "~/lib/selected-project";
import { useFefRowPersistence } from "~/lib/use-fef-row-persistence";

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
  const nextBlankId = React.useRef(1);
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
  const { isLoading: isTakeOffLoading } = useFefRowPersistence({
    projectId,
    discipline,
    section: "TAKE_OFF",
    state: takeOffState,
  });
  useFefRowPersistence({
    projectId,
    discipline,
    section: "SUPPORT_LABOR",
    state: supportLaborState,
    fallbackRows: supportLaborInitialRows,
  });

  // Auto-append a fresh blank row whenever the last row has computable labor.
  React.useEffect(() => {
    const data = takeOffState.data;
    if (data.length === 0) return;
    const lastRow = data[data.length - 1];
    if (canComputeTotalCost(lastRow)) {
      const id = nextBlankId.current++;
      takeOffState.setData((prev) => [...prev, makeBlankRow(id)]);
    }
  }, [takeOffState.data, takeOffState.setData]);

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

  const [duplicateTimes, setDuplicateTimes] = React.useState("");
  const handleDuplicateSelectedRows = () => {
    if (selectedRowIndices.size === 0) return;
    const indices = Array.from(selectedRowIndices).sort((a, b) => a - b);
    const times = Math.max(1, parseInt(duplicateTimes) || 1);
    const insertAfter = indices[indices.length - 1];
    takeOffState.setData((prev) => {
      const rowsToDuplicate = indices
        .map((i) => prev[i])
        .filter((r): r is FefRow => !!r);
      const duplicates: FefRow[] = [];
      for (let t = 0; t < times; t++) {
        for (const row of rowsToDuplicate) duplicates.push({ ...row });
      }
      return [
        ...prev.slice(0, insertAfter + 1),
        ...duplicates,
        ...prev.slice(insertAfter + 1),
      ];
    });
    setSelectedRowIndices(new Set());
  };

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
  const takeOffColumnVisibility = React.useMemo<VisibilityState>(
    () =>
      Object.fromEntries(DETAILS_COL_IDS.map((c) => [c, detailsVisible])),
    [detailsVisible],
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

  const inner = (
    <>
      {showMask && <LoadMask />}
      {title && (
        <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
          {Icon && <Icon className="size-6 md:size-7" />}
          {title}
        </h1>
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
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleDuplicateSelectedRows}
              disabled={selectedRowIndices.size === 0}
              className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Duplicate Selected Rows
            </button>
            <input
              type="number"
              min={1}
              value={duplicateTimes}
              onChange={(e) => setDuplicateTimes(e.target.value)}
              placeholder="times"
              className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={() => setDetailsVisible((v) => !v)}
              className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
            >
              {detailsVisible ? "Hide Details" : "Show Details"}
            </button>
          </div>
          <FefTableContent
            state={takeOffState}
            meta={takeOffWithSelection}
            columns={takeOffColumnsWithSelection}
            serverPagination={serverPagination}
            columnVisibility={takeOffColumnVisibility}
            minRows={20}
            getRowInvalid={isTakeOffRowInvalidLive}
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

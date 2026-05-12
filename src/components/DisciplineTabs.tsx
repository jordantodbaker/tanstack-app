import React from "react";
import {
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";
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
  type FefTableMeta,
  type ServerPagination,
} from "~/lib/table-utils";
import { useSelectedProject } from "~/lib/selected-project";
import { useFefRowPersistence } from "~/lib/use-fef-row-persistence";

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
  /** Slot rendered on the right side of the Take Off tab's toolbar. */
  takeOffExtraControls?: React.ReactNode;
  takeOffColumnVisibility?: VisibilityState;
  onTakeOffColumnVisibilityChange?: React.Dispatch<
    React.SetStateAction<VisibilityState>
  >;
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
  takeOffExtraControls,
  takeOffColumnVisibility,
  onTakeOffColumnVisibilityChange,
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

  const [duplicateTimes, setDuplicateTimes] = React.useState("");
  const handleDuplicateTopRow = () => {
    const topRow = takeOffState.data[0];
    if (!topRow || topRow.id.startsWith("__fe-blank-")) return;
    const times = Math.max(1, parseInt(duplicateTimes) || 1);
    takeOffState.setData((prev) => {
      let end = prev.length;
      while (end > 0 && prev[end - 1].id.startsWith("__fe-blank-")) end--;
      return [
        ...prev.slice(0, end),
        ...Array.from({ length: times }, () => ({ ...topRow })),
      ];
    });
  };

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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleDuplicateTopRow}
                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
              >
                Duplicate Top Row
              </button>
              <input
                type="number"
                min={1}
                value={duplicateTimes}
                onChange={(e) => setDuplicateTimes(e.target.value)}
                placeholder="times"
                className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              />
            </div>
            {takeOffExtraControls}
          </div>
          <FefTableContent
            state={takeOffState}
            meta={takeOffMeta}
            columns={takeOffColumns}
            serverPagination={serverPagination}
            columnVisibility={takeOffColumnVisibility}
            onColumnVisibilityChange={onTakeOffColumnVisibilityChange}
            minRows={20}
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

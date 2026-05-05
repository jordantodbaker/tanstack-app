import React from "react";
import { type ColumnVisibilityState } from "@tanstack/react-table";
import { setLaborTotal } from "~/lib/laborTotalsStore";
import { sumLaborCost, tabTriggerClass } from "~/lib/fef-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import type { CbsOption, FefRow } from "~/lib/types";
import {
  useTakeOffSync,
  makeBlankRow,
  FIELD_ESTIMATE_INITIAL_ROWS,
  useFefTableState,
  FefTableContent,
  type FefTableMeta,
  type ServerPagination,
} from "~/lib/table-utils";

function canComputeTotalCost(row: FefRow): boolean {
  const hours = parseFloat(row.laborHours);
  const rate = parseFloat(row.laborRate);
  return !isNaN(hours) && hours > 0 && !isNaN(rate) && row.laborRate !== "";
}
import {
  takeOffColumns,
  fieldEstimateColumns,
  supportLaborColumns,
} from "~/components/Piping/columns";

type PipingGroupValue = {
  id: number;
  size: number;
  value: number;
  pipingGroupId: number;
};
type PipingGroup = {
  id: number;
  groupNo: number;
  materialClassification: string;
  installCode: string;
  shopCode: string;
  parentCode: string;
  weightCode: string;
  material: string;
  sched: string;
  percentAdder: number;
  values: PipingGroupValue[];
};

type RoleRate = { roleName: string; schedule: string; rate: number };

export function PipingDisciplinePage({
  title,
  icon: Icon,
  cbsOptions,
  pipingGroups,
  serverPagination,
  supportLaborInitialRows,
  roleOptions,
  scheduleOptions,
  roleRates,
  taskCodeOptions,
  pipingFactors,
  laborKey,
}: {
  title: string;
  icon?: React.ElementType;
  cbsOptions: CbsOption[];
  pipingGroups: PipingGroup[];
  serverPagination?: ServerPagination;
  supportLaborInitialRows?: FefRow[];
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: RoleRate[];
  taskCodeOptions?: { code: string; taskDefinition: string }[];
  pipingFactors?: { code: string; unit: string; values: { size: number; value: number | null }[] }[];
  laborKey?: string;
}) {
  const weldGroupOptions = React.useMemo(
    () =>
      Array.from(
        new Set(pipingGroups.map((g) => g.materialClassification)),
      ).sort(),
    [pipingGroups],
  );

  const weldGroupMaterialMap = React.useMemo(
    () =>
      Object.fromEntries(
        pipingGroups.map((g) => [
          g.materialClassification,
          { shopCode: g.shopCode, installCode: g.installCode },
        ]),
      ),
    [pipingGroups],
  );

  const pipingFactorLookup = React.useMemo(() => {
    const m = new Map<string, { unit: string; values: Map<number, number> }>();
    for (const factor of pipingFactors ?? []) {
      let entry = m.get(factor.code);
      if (!entry) {
        entry = { unit: factor.unit, values: new Map<number, number>() };
        m.set(factor.code, entry);
      }
      for (const v of factor.values) {
        if (v.value !== null && !entry.values.has(v.size)) {
          entry.values.set(v.size, v.value);
        }
      }
    }
    return m;
  }, [pipingFactors]);

  const LABOR_DETAIL_COLS = ["unit", "laborFactor", "laborHours", "laborRate"] as const;
  const [laborDetailsVisible, setLaborDetailsVisible] = React.useState(true);
  const [takeOffColumnVisibility, setTakeOffColumnVisibility] =
    React.useState<ColumnVisibilityState>(() =>
      Object.fromEntries(LABOR_DETAIL_COLS.map((c) => [c, true])),
    );

  const toggleLaborDetails = () => {
    const next = !laborDetailsVisible;
    setLaborDetailsVisible(next);
    setTakeOffColumnVisibility(
      Object.fromEntries(LABOR_DETAIL_COLS.map((c) => [c, next])),
    );
  };

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

  const nextBlankId = React.useRef(1);
  const initialTakeOffRows = React.useMemo(() => [makeBlankRow(0)], []);
  const takeOffState = useFefTableState({ initialRows: initialTakeOffRows });
  const fieldEstimateState = useFefTableState({ initialRows: FIELD_ESTIMATE_INITIAL_ROWS });
  const supportLaborState = useFefTableState({ initialRows: supportLaborInitialRows });

  const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);

  React.useEffect(() => {
    const data = takeOffState.data;
    if (data.length === 0) return;
    const lastRow = data[data.length - 1];
    if (canComputeTotalCost(lastRow)) {
      const id = nextBlankId.current++;
      takeOffState.setData((prev) => [...prev, makeBlankRow(id)]);
    }
  }, [takeOffState.data, takeOffState.setData]);

  React.useEffect(() => {
    if (laborKey) setLaborTotal(laborKey, sumLaborCost(fieldEstimateState.data));
    setLaborTotal("craftSupportLabor", sumLaborCost(supportLaborState.data));
  }, [laborKey, supportLaborState.data, fieldEstimateState.data]);

  const takeOffMeta: FefTableMeta = {
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
    roleOptions,
    scheduleOptions,
    roleRates,
    taskCodeOptions,
    pipingFactorLookup,
  };
  const craftMeta: FefTableMeta = {
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
  };
  const supportMeta: FefTableMeta = {
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
    roleOptions,
    scheduleOptions,
    roleRates,
  };

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        {Icon && <Icon className="size-7" />}
        {title}
      </h1>
      <Tabs
        defaultValue="takeoff"
        className="w-full"
        onValueChange={(v) => { if (v === "estimate") syncToFieldEstimate(); }}
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
                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100"
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
            <button
              onClick={toggleLaborDetails}
              className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100"
            >
              {laborDetailsVisible ? "Hide Labor Details" : "Show Labor Details"}
            </button>
          </div>
          <FefTableContent
            state={takeOffState}
            meta={takeOffMeta}
            columns={takeOffColumns}
            serverPagination={serverPagination}
            columnVisibility={takeOffColumnVisibility}
            onColumnVisibilityChange={setTakeOffColumnVisibility}
          />
        </TabsContent>
        <TabsContent value="estimate" className="mt-4">
          <Accordion type="multiple" defaultValue={["support", "craft"]}>
            <AccordionItem value="support">
              <AccordionTrigger>Support Labor</AccordionTrigger>
              <AccordionContent>
                <FefTableContent
                  state={supportLaborState}
                  meta={supportMeta}
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
                  columns={fieldEstimateColumns}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
    </main>
  );
}

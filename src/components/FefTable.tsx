import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { FefRow, CbsOption } from "~/lib/types";
import {
  EditableCell,
  CbsSelectCell,
  ReadOnlyCell,
  TakeOffIdReadOnlyCell,
  useTakeOffSync,
  TAKE_OFF_INITIAL_ROWS,
  FIELD_ESTIMATE_INITIAL_ROWS,
  readOnlyCellClass,
  useFefTableState,
  FefTableContent,
  type FefTableMeta,
} from "~/lib/table-utils";
import {
  RoleSelectCell,
  ScheduleSelectCell,
  TotalCostCell,
} from "~/components/Piping/cells";
import { setMaterialsSectionTotal } from "~/lib/materialsStore";
import { setLaborTotal } from "~/lib/laborTotalsStore";
import { sumLaborCost, sumMaterialCost, tabTriggerClass } from "~/lib/fef-helpers";

const columnHelper = createColumnHelper<FefRow>();

function MaterialsTotalCostCell({ row }: { row: { original: FefRow }; getValue: () => unknown }) {
  const qty = parseFloat(row.original.quantity);
  const cost = parseFloat(row.original.materialCost);
  const total =
    !isNaN(qty) && !isNaN(cost) && row.original.quantity !== "" && row.original.materialCost !== ""
      ? (qty * cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "";
  return <span className={readOnlyCellClass}>{total ? `$${total}` : ""}</span>;
}

const fieldEstimateColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("description", { header: "Description", cell: CbsSelectCell, size: 300 }),
  columnHelper.accessor("role", { header: "Role", cell: RoleSelectCell, size: 180 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ScheduleSelectCell, size: 150 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: EditableCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: ReadOnlyCell }),
  columnHelper.display({ id: "totalCost", header: "Total Cost ($)", cell: TotalCostCell, size: 130 }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 150 }),
  columnHelper.accessor("description", { header: "Description", cell: CbsSelectCell, size: 300 }),
  columnHelper.accessor("role", { header: "Role", cell: RoleSelectCell, size: 180 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ScheduleSelectCell, size: 150 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: EditableCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: ReadOnlyCell }),
  columnHelper.display({ id: "totalCost", header: "Total Cost ($)", cell: TotalCostCell, size: 130 }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

const materialsColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("description", { header: "Description", cell: ReadOnlyCell, size: 300 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("materialCost", { header: "Material Cost ($)", cell: EditableCell }),
  columnHelper.display({ id: "totalCost", header: "Total Cost ($)", cell: MaterialsTotalCostCell }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

export function FefTable({ title }: { title: string }) {
  const state = useFefTableState();
  return (
    <main className="p-3 md:p-4">
      <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">{title}</h1>
      <FefTableContent state={state} columns={fieldEstimateColumns} />
    </main>
  );
}

export function DisciplinePage({
  title,
  icon: Icon,
  initialRows,
  cbsOptions,
  variant,
  sectionKey,
  laborKey,
  roleOptions,
  scheduleOptions,
  roleRates,
}: {
  title?: string;
  icon?: React.ElementType;
  initialRows?: FefRow[];
  cbsOptions?: CbsOption[];
  variant?: "materials";
  sectionKey?: string;
  laborKey?: string;
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: { roleName: string; schedule: string; rate: number }[];
}) {
  const takeOffState = useFefTableState({
    initialRows: variant === "materials" ? initialRows : TAKE_OFF_INITIAL_ROWS,
    sectionKey: variant === "materials" ? sectionKey : undefined,
  });
  const fieldEstimateState = useFefTableState({
    initialRows: FIELD_ESTIMATE_INITIAL_ROWS,
  });

  const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);

  React.useEffect(() => {
    if (!laborKey) return;
    setLaborTotal(laborKey, sumLaborCost(fieldEstimateState.data));
  }, [laborKey, fieldEstimateState.data]);

  React.useEffect(() => {
    if (variant !== "materials" || !sectionKey) return;
    setMaterialsSectionTotal(sectionKey, sumMaterialCost(takeOffState.data));
  }, [variant, sectionKey, takeOffState.data]);

  const baseMeta: FefTableMeta = { cbsOptions };
  const laborMeta: FefTableMeta = { ...baseMeta, roleOptions, scheduleOptions, roleRates };

  if (variant === "materials") {
    return (
      <FefTableContent
        state={takeOffState}
        meta={baseMeta}
        columns={materialsColumns}
      />
    );
  }

  const tabs = (
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
        <FefTableContent
          state={takeOffState}
          meta={laborMeta}
          columns={takeOffColumns}
        />
      </TabsContent>
      <TabsContent value="estimate" className="mt-4">
        <FefTableContent
          state={fieldEstimateState}
          meta={laborMeta}
          columns={fieldEstimateColumns}
        />
      </TabsContent>
    </Tabs>
  );

  if (!title) return tabs;

  return (
    <main className="p-3 md:p-4">
      <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
        {Icon && <Icon className="size-6 md:size-7" />}
        {title}
      </h1>
      {tabs}
    </main>
  );
}
